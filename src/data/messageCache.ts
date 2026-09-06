// Device-local message history. E2EE DMs only exist as plaintext on this
// device (the server has ciphertext we cannot open twice). This is the
// Telegram-style "I refreshed and everything is still here" store — same
// browser/profile, not a new phone.

import type { Message } from "./types";

const DB_NAME = "atlas-messages";
const STORE = "messages";
const PT = "plaintexts";
const PT_LS = "atlas.pt";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("chatId", "chatId", { unique: false });
      }
      if (!db.objectStoreNames.contains(PT)) {
        db.createObjectStore(PT, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("message cache open failed"));
  });
  return dbPromise;
}

function isPlaceholder(text: string | undefined): boolean {
  if (!text) return true;
  return text.startsWith("🔒 ") || text === "Decrypting…" || text === "Расшифровка…";
}

/** Strip ephemeral UI flags before writing. */
function toRecord(message: Message): Message | null {
  if (message.pending || message.decrypting) return null;
  if (message.deleted) return { ...message, text: "Message deleted", sourceText: undefined, contentVersion: undefined, attachment: undefined, decrypting: false, decryptFailed: false };
  if (!message.deleted && isPlaceholder(message.text) && !message.sealed) return null;
  return {
    ...message,
    decrypting: false,
    decryptFailed: false,
    pending: false,
    failed: false,
  };
}

export async function cachePut(message: Message): Promise<void> {
  const record = toRecord(message);
  if (!record) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* private mode etc. */
  }
}

export async function cacheGet(id: string): Promise<Message | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Message | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export function loadPlaintextsSync(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PT_LS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePlaintextSync(id: string, text: string) {
  if (!id || !text || text.startsWith("🔒 ")) return;
  try {
    const o = loadPlaintextsSync();
    o[id] = text;
    localStorage.setItem(PT_LS, JSON.stringify(o));
  } catch {
    /* quota */
  }
}

export async function putPlaintext(id: string, chatId: string, text: string): Promise<void> {
  savePlaintextSync(id, text);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PT, "readwrite");
      tx.objectStore(PT).put({ id, chatId, text });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function allPlaintexts(): Promise<Record<string, string>> {
  const out = loadPlaintextsSync();
  try {
    const db = await openDb();
    const fromIdb: Record<string, string> = await new Promise((resolve, reject) => {
      const tx = db.transaction(PT, "readonly");
      const req = tx.objectStore(PT).getAll();
      req.onsuccess = () => {
        const bag: Record<string, string> = {};
        for (const row of (req.result as { id: string; text: string }[]) ?? []) {
          if (row?.id && row.text) bag[row.id] = row.text;
        }
        resolve(bag);
      };
      req.onerror = () => reject(req.error);
    });
    return { ...out, ...fromIdb };
  } catch {
    return out;
  }
}

export async function cacheForChat(chatId: string): Promise<Message[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("chatId");
      const req = idx.getAll(chatId);
      req.onsuccess = () => {
        const rows = (req.result as Message[]) ?? [];
        rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Remove a plaintext revision from both persistence layers. */
export async function forgetPlaintext(id: string): Promise<void> {
  try {
    const records = loadPlaintextsSync();
    delete records[id];
    localStorage.setItem(PT_LS, JSON.stringify(records));
  } catch { /* storage unavailable */ }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PT, "readwrite");
      tx.objectStore(PT).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage unavailable */ }
}
