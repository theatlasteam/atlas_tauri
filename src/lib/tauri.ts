// Bridge to the Tauri Rust core. Everything here degrades gracefully when the
// app runs as a plain web page (vite dev in a browser): secrets fall back to
// localStorage WITH a loud warning, and E2EE reports itself unavailable so the
// UI disables encrypted mode instead of pretending.

import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isAndroid } from "./platform";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------- secure secret storage ----------

const DEV_PREFIX = "atlas.devsecret.";
let warned = false;
function devWarn() {
  if (!warned) {
    warned = true;
    console.warn(
      "[atlas] Tauri not detected — secrets are in localStorage. This is a DEV-ONLY fallback; " +
        "packaged builds use the OS keychain / app-sandboxed storage.",
    );
  }
}

export async function secretGet(key: string): Promise<string | null> {
  if (isTauri) return (await invoke<string | null>("secret_get", { key })) ?? null;
  devWarn();
  return localStorage.getItem(DEV_PREFIX + key);
}

export async function secretSet(key: string, value: string): Promise<void> {
  if (isTauri) return invoke("secret_set", { key, value });
  devWarn();
  localStorage.setItem(DEV_PREFIX + key, value);
}

export async function secretDelete(key: string): Promise<void> {
  if (isTauri) return invoke("secret_delete", { key });
  devWarn();
  localStorage.removeItem(DEV_PREFIX + key);
}

// ---------- E2EE (private keys never leave the Rust core) ----------

export const e2eeAvailable = isTauri;

export function e2eePublicKey(): Promise<string> {
  return invoke<string>("e2ee_public_key");
}

export function e2eeFingerprint(publicKey: string): Promise<string> {
  return invoke<string>("e2ee_fingerprint", { publicKey });
}

export function e2eeSeal(peerPublicKey: string, plaintext: string): Promise<string> {
  return invoke<string>("e2ee_seal", { peerPublicKey, plaintext });
}

export function e2eeOpen(peerPublicKey: string, body: string): Promise<string> {
  return invoke<string>("e2ee_open", { peerPublicKey, body });
}

// ---------- Native Experimental (Android-only prototype) ----------
//
// A plain-Views chat list + chat screen (src-tauri/gen/android/.../native/)
// that talks to the REST API directly, bypassing the WebView entirely.
// Plaintext only, no live updates — see NativeChatListActivity's in-app
// banner. Launched via a custom-scheme deep link rather than a Tauri
// plugin/JNI bridge, so no native Rust glue is needed: Android's intent
// resolver routes atlas-native://open straight back into our own app.

export const nativeExperimentalAvailable = isTauri && isAndroid();

export async function launchNativeExperimental(serverUrl: string, token: string): Promise<void> {
  const url = `atlas-native://open?serverUrl=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(token)}`;
  await openUrl(url);
}
