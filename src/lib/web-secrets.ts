// Persistent secret store for the browser / PWA.
//
// Auth token: its own cookie (Path=/app) + IndexedDB. Never mixed into the
// E2EE dump — rewriting that bag on every encrypt was wiping login on F5.
//
// E2EE keys: IndexedDB, with a small Path=/app cookie backup of identity +
// sessions only (not 50 one-time prekeys — those blow the cookie size limit).

const DB_NAME = "atlas-secure";
const STORE = "kv";
const COOKIE_PREFIX = "ae2.";
const AUTH_COOKIE = "atlas_tok";
const COOKIE_PATH = "/app";
const CHUNK = 3000;
const MAX_CHUNKS = 24;

const AUTH_KEYS = new Set(["auth_token", "server_url"]);

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    const timer = setTimeout(() => {
      dbPromise = null;
      reject(new Error("IndexedDB open timed out"));
    }, 2500);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function cookieAttrs(): string {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; Path=${COOKIE_PATH}; SameSite=Strict; Max-Age=31536000${secure}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const s = part.trim();
    if (s.startsWith(prefix)) return decodeURIComponent(s.slice(prefix.length));
  }
  return null;
}

function expireCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=${COOKIE_PATH}; Max-Age=0`;
}

function writeAuthCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (!token) {
    expireCookie(AUTH_COOKIE);
    return;
  }
  document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}${cookieAttrs()}`;
}

function isE2eeKey(key: string): boolean {
  return (
    key.startsWith("e2ee") ||
    key.startsWith("e2ee2") ||
    key.startsWith("olm_")
  );
}

function slimE2ee(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!isE2eeKey(k)) continue;
    if (k.startsWith("e2ee2_opk_")) continue;
    out[k] = v;
  }
  return out;
}

function dumpE2eeCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const n = Number.parseInt(readCookie(`${COOKIE_PREFIX}n`) ?? "0", 10);
    if (!n || n < 1) return out;
    let encoded = "";
    for (let i = 0; i < n && i < MAX_CHUNKS; i++) {
      encoded += readCookie(`${COOKIE_PREFIX}${i}`) ?? "";
    }
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Record<string, string>;
    if (parsed && typeof parsed === "object") Object.assign(out, parsed);
  } catch {
    /* corrupt */
  }
  return out;
}

function writeE2eeCookies(data: Record<string, string>) {
  if (typeof document === "undefined") return;
  const payload = JSON.stringify(slimE2ee(data));
  const encoded = encodeURIComponent(payload);
  if (encoded.length > CHUNK * MAX_CHUNKS) return;
  const n = Math.min(MAX_CHUNKS, Math.ceil(encoded.length / CHUNK) || 1);
  for (let i = 0; i < MAX_CHUNKS; i++) expireCookie(`${COOKIE_PREFIX}${i}`);
  expireCookie(`${COOKIE_PREFIX}n`);
  for (let i = 0; i < n; i++) {
    const slice = encoded.slice(i * CHUNK, (i + 1) * CHUNK);
    document.cookie = `${COOKIE_PREFIX}${i}=${slice}${cookieAttrs()}`;
  }
  document.cookie = `${COOKIE_PREFIX}n=${String(n)}${cookieAttrs()}`;
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function webSecretGet(key: string): Promise<string | null> {
  try {
    const fromIdb = await idbGet(key);
    if (fromIdb !== null) return fromIdb;
  } catch {
    /* fall through */
  }
  if (AUTH_KEYS.has(key)) {
    if (key === "auth_token") return readCookie(AUTH_COOKIE);
    return null;
  }
  return dumpE2eeCookies()[key] ?? null;
}

export async function webSecretSet(key: string, value: string): Promise<void> {
  try {
    await idbPut(key, value);
  } catch {
    /* IDB missing */
  }
  if (key === "auth_token") writeAuthCookie(value);
}

export async function webSecretDelete(key: string): Promise<void> {
  try {
    await idbDel(key);
  } catch {
    /* ignore */
  }
  if (key === "auth_token") writeAuthCookie(null);
}

/** Keys to hydrate the WASM ratchet — never auth. */
export async function webSecretDump(): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...dumpE2eeCookies() };
  try {
    const db = await openDb();
    const fromIdb: Record<string, string> = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor();
      const bag: Record<string, string> = {};
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(bag);
          return;
        }
        if (typeof cursor.key === "string" && typeof cursor.value === "string" && isE2eeKey(cursor.key)) {
          bag[cursor.key] = cursor.value;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
    Object.assign(out, fromIdb);
  } catch {
    /* cookies only */
  }
  return out;
}

export async function webSecretReplaceAll(data: Record<string, string>): Promise<void> {
  const e2ee = slimE2ee(data);
  // Keep OPKs in IDB even though cookies skip them.
  const forIdb: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (isE2eeKey(k)) forIdb[k] = v;
  }
  if (Object.keys(forIdb).length === 0) return;
  writeE2eeCookies(e2ee);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const [k, v] of Object.entries(forIdb)) store.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* cookies already written */
  }
}

export async function webSecretsPersistable(): Promise<boolean> {
  try {
    const probe = "__atlas_persist_probe__";
    await webSecretSet(probe, "1");
    const got = await webSecretGet(probe);
    await webSecretDelete(probe);
    return got === "1";
  } catch {
    return false;
  }
}
