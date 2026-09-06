/** Reasons the current browser session is unsafe for E2EE chat. */

export type SecurityIssueId =
  | "insecure-origin"
  | "no-secure-context"
  | "no-subtle-crypto"
  | "no-indexeddb"
  | "iframes"
  | "insecure-api"
  | "no-persistence";

export interface SecurityIssue {
  id: SecurityIssueId;
  severity: "blocking" | "warning";
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function inspectSessionSecurity(apiBase?: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  if (typeof window === "undefined") return issues;

  const { protocol, hostname } = window.location;
  const https = protocol === "https:";
  const local = isLocalhost(hostname);

  if (!https && !local) {
    issues.push({ id: "insecure-origin", severity: "blocking" });
  }
  if (!window.isSecureContext) {
    issues.push({ id: "no-secure-context", severity: "blocking" });
  }
  if (!globalThis.crypto?.subtle) {
    issues.push({ id: "no-subtle-crypto", severity: "blocking" });
  }
  if (typeof indexedDB === "undefined") {
    issues.push({ id: "no-indexeddb", severity: "warning" });
  }
  try {
    if (window.self !== window.top) {
      issues.push({ id: "iframes", severity: "blocking" });
    }
  } catch {
    issues.push({ id: "iframes", severity: "blocking" });
  }
  if (apiBase) {
    try {
      const api = new URL(apiBase, window.location.href);
      if (api.protocol === "http:" && !isLocalhost(api.hostname) && https) {
        issues.push({ id: "insecure-api", severity: "blocking" });
      }
      if (api.protocol === "http:" && !isLocalhost(api.hostname) && !https) {
        issues.push({ id: "insecure-api", severity: "blocking" });
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return issues;
}

export function hasBlockingSecurityIssue(issues: SecurityIssue[]): boolean {
  return issues.some((i) => i.severity === "blocking");
}
