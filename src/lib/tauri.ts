// Bridge to the Tauri Rust core, or to the in-browser E2EE implementation
// when the app is running as a PWA at /app.

import {
  wasmE2ee2Bundle,
  wasmE2ee2Decrypt,
  wasmE2ee2Encrypt,
  wasmE2ee2Fingerprint,
  wasmE2ee2HasSession,
  wasmE2ee2NewPrekeys,
  wasmE2ee2StartSession,
  wasmE2eeFingerprint,
  wasmE2eeOpen,
  wasmE2eePublicKey,
  wasmE2eeSeal,
  wasmMegolmDecrypt,
  wasmMegolmEncrypt,
  wasmMegolmImportKey,
  type MegolmSeal,
} from "./e2ee-wasm";
import { inspectSessionSecurity, hasBlockingSecurityIssue } from "./secure-context";
import { webSecretDelete, webSecretGet, webSecretSet } from "./web-secrets";
import { isAndroid } from "./platform";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEV_PREFIX = "atlas.devsecret.";
let warned = false;
function devWarn() {
  if (!warned) {
    warned = true;
    console.warn(
      "[atlas] Tauri not detected — secrets are in IndexedDB (PWA) or localStorage. " +
        "Packaged builds use the OS keychain.",
    );
  }
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function secretGet(key: string): Promise<string | null> {
  if (isTauri) return (await invokeTauri<string | null>("secret_get", { key })) ?? null;
  devWarn();
  const fromIdb = await webSecretGet(key);
  if (fromIdb !== null) return fromIdb;
  try {
    return localStorage.getItem(DEV_PREFIX + key);
  } catch {
    return null;
  }
}

export async function secretSet(key: string, value: string): Promise<void> {
  if (isTauri) return invokeTauri("secret_set", { key, value });
  devWarn();
  await webSecretSet(key, value);
}

export async function secretDelete(key: string): Promise<void> {
  if (isTauri) return invokeTauri("secret_delete", { key });
  localStorage.removeItem(DEV_PREFIX + key);
  await webSecretDelete(key);
}

/** True when we can actually run E2EE (Tauri core, or a secure browser context). */
export const e2eeAvailable =
  isTauri ||
  (typeof window !== "undefined" &&
    !!globalThis.crypto?.subtle &&
    !hasBlockingSecurityIssue(inspectSessionSecurity()));

export function e2eePublicKey(): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee_public_key");
  return wasmE2eePublicKey();
}

export function e2eeFingerprint(publicKey: string): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee_fingerprint", { publicKey });
  return wasmE2eeFingerprint(publicKey);
}

export function e2eeSeal(peerPublicKey: string, plaintext: string): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee_seal", { peerPublicKey, plaintext });
  return wasmE2eeSeal(peerPublicKey, plaintext);
}

export function e2eeOpen(peerPublicKey: string, body: string): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee_open", { peerPublicKey, body });
  return wasmE2eeOpen(peerPublicKey, body);
}

export interface PrekeyBundle {
  identityKey: string;
  signingKey: string;
  signedPrekey: string;
  signedPrekeyId: number;
  signedPrekeySig: string;
}

export function e2ee2Bundle(): Promise<PrekeyBundle> {
  if (isTauri) return invokeTauri<PrekeyBundle>("e2ee2_bundle");
  return wasmE2ee2Bundle();
}

export function e2ee2NewPrekeys(count: number): Promise<string[]> {
  if (isTauri) return invokeTauri<string[]>("e2ee2_new_prekeys", { count });
  return wasmE2ee2NewPrekeys(count);
}

export function e2ee2StartSession(
  peer: string,
  bundle: PrekeyBundle,
  oneTimePrekey: string | null,
): Promise<void> {
  if (isTauri) return invokeTauri("e2ee2_start_session", { peer, bundle, oneTimePrekey });
  return wasmE2ee2StartSession(peer, bundle, oneTimePrekey);
}

export function e2ee2Encrypt(peer: string, plaintext: string): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee2_encrypt", { peer, plaintext });
  return wasmE2ee2Encrypt(peer, plaintext);
}

export function e2ee2Decrypt(peer: string, body: string): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee2_decrypt", { peer, body });
  return wasmE2ee2Decrypt(peer, body);
}

export function e2ee2HasSession(peer: string): Promise<boolean> {
  if (isTauri) return invokeTauri<boolean>("e2ee2_has_session", { peer });
  return wasmE2ee2HasSession(peer);
}

export function e2ee2Fingerprint(bundle: PrekeyBundle): Promise<string> {
  if (isTauri) return invokeTauri<string>("e2ee2_fingerprint", { bundle });
  return wasmE2ee2Fingerprint(bundle);
}

export type { MegolmSeal };

export function megolmEncrypt(chatId: string, plaintext: string): Promise<MegolmSeal> {
  if (isTauri) return invokeTauri<MegolmSeal>("megolm_encrypt", { chatId, plaintext });
  return wasmMegolmEncrypt(chatId, plaintext);
}

export function megolmImportKey(
  chatId: string,
  senderId: string,
  sessionId: string,
  sessionKey: string,
): Promise<void> {
  if (isTauri) return invokeTauri("megolm_import_key", { chatId, senderId, sessionId, sessionKey });
  return wasmMegolmImportKey(chatId, senderId, sessionId, sessionKey);
}

export function megolmDecrypt(
  chatId: string,
  senderId: string,
  sessionId: string,
  ciphertext: string,
): Promise<string> {
  if (isTauri) {
    return invokeTauri<string>("megolm_decrypt", { chatId, senderId, sessionId, ciphertext });
  }
  return wasmMegolmDecrypt(chatId, senderId, sessionId, ciphertext);
}

export const nativeExperimentalAvailable = isTauri && isAndroid();

export async function launchNativeExperimental(serverUrl: string, token: string): Promise<void> {
  const url = `atlas-native://open?serverUrl=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(token)}`;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}
