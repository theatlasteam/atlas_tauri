import { webSecretDump, webSecretReplaceAll } from "./web-secrets";

type Wasm = typeof import("./e2ee-wasm/atlas_e2ee.js");

let wasm: Wasm | null = null;
let ready: Promise<Wasm> | null = null;

const LS_E2EE = "atlas.e2ee";

function persistSync() {
  if (!wasm) return;
  try {
    const dump = wasm.store_dump();
    try {
      localStorage.setItem(LS_E2EE, dump);
    } catch {
      /* quota */
    }
    const parsed = JSON.parse(dump) as Record<string, string>;
    void webSecretReplaceAll(parsed);
  } catch {
    /* ignore */
  }
}

let persistChain: Promise<void> = Promise.resolve();
function persist() {
  persistChain = persistChain
    .then(() => {
      persistSync();
    })
    .catch(() => {});
}

function loadLsE2ee(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_E2EE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

export async function loadE2eeWasm(): Promise<Wasm> {
  if (wasm) return wasm;
  if (!ready) {
    ready = (async () => {
      const mod = await import("./e2ee-wasm/atlas_e2ee.js");
      const wasmUrl = (await import("./e2ee-wasm/atlas_e2ee_bg.wasm?url")).default;
      const raw = await fetch(wasmUrl, { cache: "no-store" }).then((r) => {
        if (!r.ok) throw new Error(`wasm fetch ${r.status}`);
        return r.arrayBuffer();
      });
      // Own copy: Safari can detach the fetch buffer. Prefer sync instantiate —
      // iOS streaming compile is the usual hang.
      const bytes = raw.slice(0);
      try {
        mod.initSync({ module: bytes });
      } catch (e) {
        console.warn("[atlas] wasm initSync failed, async fallback", e);
        await mod.default({ module_or_path: bytes });
      }
      const fromLs = loadLsE2ee();
      const existing = await withTimeout(webSecretDump(), 2500, fromLs);
      mod.store_hydrate(JSON.stringify({ ...fromLs, ...existing }));
      wasm = mod;
      const flush = () => persistSync();
      window.addEventListener("pagehide", flush);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      console.info("[atlas] olm wasm ready");
      return mod;
    })();
  }
  return ready;
}

let wasmQueue: Promise<unknown> = Promise.resolve();

async function withWasm<T>(fn: (m: Wasm) => T): Promise<T> {
  const run = wasmQueue.then(async () => {
    const m = await loadE2eeWasm();
    const out = fn(m);
    persist();
    return out;
  });
  wasmQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export const wasmE2eePublicKey = () => withWasm((m) => m.e2ee_public_key());
export const wasmE2eeFingerprint = (k: string) => withWasm((m) => m.e2ee_fingerprint(k));
export const wasmE2eeSeal = (peer: string, pt: string) => withWasm((m) => m.e2ee_seal(peer, pt));
export const wasmE2eeOpen = (peer: string, body: string) => withWasm((m) => m.e2ee_open(peer, body));
export const wasmE2ee2Bundle = async () => JSON.parse(await withWasm((m) => m.e2ee2_bundle()));
export const wasmE2ee2NewPrekeys = async (n: number) =>
  JSON.parse(await withWasm((m) => m.e2ee2_new_prekeys(n))) as string[];
export const wasmE2ee2StartSession = (peer: string, bundle: unknown, opk: string | null) =>
  withWasm((m) => {
    m.e2ee2_start_session(peer, JSON.stringify(bundle), opk ?? undefined);
  });
export const wasmE2ee2Encrypt = (peer: string, pt: string) => withWasm((m) => m.e2ee2_encrypt(peer, pt));
export const wasmE2ee2Decrypt = (peer: string, body: string) => withWasm((m) => m.e2ee2_decrypt(peer, body));
export const wasmE2ee2HasSession = (peer: string) => withWasm((m) => m.e2ee2_has_session(peer));
export const wasmE2ee2Fingerprint = (bundle: unknown) =>
  withWasm((m) => m.e2ee2_fingerprint(JSON.stringify(bundle)));
