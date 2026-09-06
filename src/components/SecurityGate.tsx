import { createResource, createSignal, For, Show } from "solid-js";
import { apiBase } from "../data/api";
import { t, type TranslationKey } from "../lib/i18n";
import {
  hasBlockingSecurityIssue,
  inspectSessionSecurity,
  type SecurityIssue,
  type SecurityIssueId,
} from "../lib/secure-context";
import { webSecretsPersistable } from "../lib/web-secrets";
import { isTauri } from "../lib/tauri";
import { isIOS } from "../lib/platform";

const ISSUE_TITLE: Record<SecurityIssueId, TranslationKey> = {
  "insecure-origin": "security.insecureOrigin.title",
  "no-secure-context": "security.noSecureContext.title",
  "no-subtle-crypto": "security.noCrypto.title",
  "no-indexeddb": "security.noIdb.title",
  iframes: "security.iframe.title",
  "insecure-api": "security.insecureApi.title",
  "no-persistence": "security.noPersist.title",
};

const ISSUE_BODY: Record<SecurityIssueId, TranslationKey> = {
  "insecure-origin": "security.insecureOrigin.body",
  "no-secure-context": "security.noSecureContext.body",
  "no-subtle-crypto": "security.noCrypto.body",
  "no-indexeddb": "security.noIdb.body",
  iframes: "security.iframe.body",
  "insecure-api": "security.insecureApi.body",
  "no-persistence": "security.noPersist.body",
};

const ACK_KEY = "atlas.security.ack.insecure";

export default function SecurityGate() {
  if (isTauri) return null;

  const [persist] = createResource(webSecretsPersistable);
  const [acked, setAcked] = createSignal(sessionStorage.getItem(ACK_KEY) === "1");

  const issues = (): SecurityIssue[] => {
    const list = inspectSessionSecurity(apiBase());
    if (persist() === false) list.push({ id: "no-persistence", severity: "warning" });
    return list;
  };

  const blocking = () => hasBlockingSecurityIssue(issues());
  const showModal = () => issues().length > 0 && (blocking() || !acked());

  const httpsUrl = () => {
    try {
      const u = new URL(window.location.href);
      u.protocol = "https:";
      return u.toString();
    } catch {
      return "";
    }
  };

  return (
    <>
      <Show when={issues().length > 0}>
        <div
          role="alert"
          class="z-50 shrink-0 border-b-2 border-red-700 bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white"
        >
          {blocking() ? t("security.stripBlocking") : t("security.stripWarning")}
        </div>
      </Show>

      <Show when={showModal()}>
        <div class="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-4 sm:items-center">
          <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-red-500 bg-bg p-5 text-ink shadow-floating">
            <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">{t("security.kicker")}</p>
            <h2 class="mt-2 font-heading text-2xl font-bold">{t("security.title")}</h2>
            <p class="mt-3 text-sm leading-relaxed text-ink-muted">{t("security.lede")}</p>
            <ul class="mt-4 space-y-3">
              <For each={issues()}>
                {(issue) => (
                  <li class="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                    <p class="text-sm font-semibold text-red-700 dark:text-red-300">
                      {issue.severity === "blocking" ? t("security.blocking") : t("security.warning")} —{" "}
                      {t(ISSUE_TITLE[issue.id])}
                    </p>
                    <p class="mt-1 text-sm leading-relaxed text-ink-muted">{t(ISSUE_BODY[issue.id])}</p>
                  </li>
                )}
              </For>
            </ul>
            <Show when={!window.isSecureContext && httpsUrl()}>
              <a
                href={httpsUrl()}
                class="mt-4 flex w-full items-center justify-center rounded-pill bg-red-600 px-4 py-3 text-sm font-semibold text-white"
              >
                {t("security.switchHttps")}
              </a>
            </Show>
            <Show when={isIOS()}>
              <p class="mt-4 text-xs leading-relaxed text-ink-subtle">{t("security.iosHint")}</p>
            </Show>
            <Show when={!blocking()}>
              <button
                type="button"
                class="mt-4 w-full rounded-pill border border-border px-4 py-3 text-sm font-medium"
                onClick={() => {
                  sessionStorage.setItem(ACK_KEY, "1");
                  setAcked(true);
                }}
              >
                {t("security.ack")}
              </button>
            </Show>
            <Show when={blocking()}>
              <p class="mt-4 text-center text-xs font-medium text-red-600">{t("security.cannotContinue")}</p>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}
