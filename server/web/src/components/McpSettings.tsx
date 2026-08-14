import { createSignal, Show } from "solid-js";
import { t } from "../lib/i18n";
import { X, Copy } from "phosphor-solid-js";
import Checkbox from "./Checkbox";

const TOOLS = [
  { name: "list_plugins", desc: "plugins.tool.list" },
  { name: "get_plugin", desc: "plugins.tool.get" },
  { name: "validate_plugin", desc: "plugins.tool.validate" },
  { name: "create_plugin", desc: "plugins.tool.create" },
  { name: "update_plugin", desc: "plugins.tool.update" },
  { name: "delete_plugin", desc: "plugins.tool.delete" },
  { name: "read_docs", desc: "plugins.tool.docs" },
];

/** MCP configuration drawer for the developer panel: the endpoint an AI
 *  assistant should connect to, plus the developer's session token so write
 *  tools authenticate as them. */
export default function McpSettings(props: {
  endpoint: string;
  token: string;
  onClose: () => void;
}) {
  const [showToken, setShowToken] = createSignal(false);
  const [copied, setCopied] = createSignal<"endpoint" | "token" | "snippet" | null>(null);

  const copy = async (kind: "endpoint" | "token" | "snippet", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const snippet = () =>
    `mcp --transport streamable-http ${props.endpoint}/mcp`;

  const input =
    "w-full rounded-lg border border-[#2a241c] bg-[#1a1712] px-3 py-2 font-mono text-xs text-[#f2ede2] outline-none transition focus:border-[#c9772e]/70";

  const copyButton = (kind: "endpoint" | "token" | "snippet") => (
    <button
      type="button"
      onClick={() =>
        void copy(
          kind,
          kind === "endpoint"
            ? `${props.endpoint}/mcp`
            : kind === "token"
              ? props.token
              : snippet(),
        )
      }
      aria-label={t("pluginsEditor.mcpCopy")}
      class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
    >
      <Show when={copied() !== kind} fallback={<span class="text-xs text-[#c9772e]">✓</span>}>
        <Copy size={14} />
      </Show>
    </button>
  );

  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-[#2a241c] bg-[#0f0d0b] px-4 py-3">
        <h2 class="font-heading text-sm font-semibold text-[#f2ede2]">
          {t("pluginsEditor.mcpTitle")}
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label={t("pluginsEditor.settingsClose")}
          class="grid h-8 w-8 place-items-center rounded-full text-[#8a8171] transition hover:bg-white/5 hover:text-[#f2ede2]"
        >
          <X size={16} />
        </button>
      </header>

      <div class="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <p class="text-xs leading-relaxed text-[#8a8171]">{t("pluginsEditor.mcpBody")}</p>

        {/* Endpoint */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.mcpEndpoint")}
          </span>
          <div class="flex items-center gap-2">
            <input readonly value={`${props.endpoint}/mcp`} class={input} />
            {copyButton("endpoint")}
          </div>
        </section>

        {/* Session token */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.mcpToken")}
          </span>
          <div class="flex items-center gap-2">
            <input
              readonly
              type={showToken() ? "text" : "password"}
              value={props.token}
              class={input}
            />
            {copyButton("token")}
          </div>
          <label class="mt-2 flex items-center gap-2 text-[11px] text-[#8a8171]">
            <Checkbox checked={showToken()} onChange={setShowToken} />
            {t("pluginsEditor.mcpReveal")}
          </label>
          <p class="mt-2 text-[11px] leading-relaxed text-[#5c554a]">
            {t("pluginsEditor.mcpTokenWarn")}
          </p>
        </section>

        {/* Connect snippet */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.mcpConnect")}
          </span>
          <div class="flex items-center gap-2">
            <input readonly value={snippet()} class={input} />
            {copyButton("snippet")}
          </div>
        </section>

        {/* Tools */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.mcpTools")}
          </span>
          <div class="space-y-1">
            {TOOLS.map((tool) => (
              <div
                class="flex items-center gap-2 rounded-lg border border-[#2a241c] bg-[#1a1712] px-3 py-2"
              >
                <code class="shrink-0 font-mono text-xs text-[#f5c98a]">{tool.name}</code>
                <span class="text-[11px] text-[#8a8171]">{t(tool.desc as never)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer class="flex items-center justify-end border-t border-[#2a241c] bg-[#0f0d0b] px-4 py-3">
        <button
          type="button"
          onClick={props.onClose}
          class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
        >
          {t("pluginsEditor.settingsCancel")}
        </button>
      </footer>
    </div>
  );
}
