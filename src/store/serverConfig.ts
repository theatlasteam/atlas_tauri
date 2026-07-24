// Overridable backend URL, for pointing a build at a different server
// (local dev vs. staging vs. self-hosted) without rebuilding. Persisted in
// localStorage — it's a URL, not a secret, so it doesn't need the keychain.
// Surfaced via a hidden gesture (tap the logo 7x on the login screen) rather
// than permanent UI, since normal users never need to touch it.

import { createRoot, createSignal } from "solid-js";

const STORAGE_KEY = "atlas.server.override";

function defaultApiBase(): string {
  return (import.meta.env.VITE_ATLAS_API as string | undefined) ?? "http://127.0.0.1:8080";
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function loadOverride(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function createServerConfigStore() {
  const [override, setOverride] = createSignal<string | null>(loadOverride());

  const apiBase = () => normalize(override() ?? defaultApiBase());
  const wsUrl = () => apiBase().replace(/^http/, "ws") + "/ws";
  const isOverridden = () => override() !== null;

  /** Pass null (or an empty string) to clear the override and go back to default. */
  const setServerUrl = (url: string | null) => {
    const trimmed = url?.trim();
    if (!trimmed) {
      setOverride(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* private browsing etc. — in-memory override still applies this session */
      }
      return;
    }
    const normalized = normalize(trimmed);
    setOverride(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      /* ignore */
    }
  };

  return { apiBase, wsUrl, isOverridden, defaultApiBase, setServerUrl };
}

export const serverConfig = createRoot(createServerConfigStore);
