import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const out = ts.transpileModule(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", out)((id) => {
    if (id in dependencies) return dependencies[id];
    if (id.startsWith("solid-js")) return require(id);
    throw new Error("Unmocked dependency " + id);
  }, module, module.exports);
  return module.exports;
}
const mapping = load("src/data/mapping.ts");
const dto = (id, body = "old", extra = {}) => ({ id: String(id).padStart(5, "0"), chatId: "chat", authorId: "peer", body, scheme: "plain", sentAt: "2026-09-06T00:00:00Z", reactions: [], attachment: null, replyTo: null, sealed: false, deleted: false, ...extra });
function setup(options = {}) {
  const plaintexts = new Map();
  const disk = new Map();
  const calls = [];
  let decrypts = 0;
  const api = {
    listMessages: async (id, q) => { calls.push(q); return options.listMessages?.(id, q) ?? []; },
    editMessage: async (id, {body, scheme}) => dto(id, body, { authorId: "me", scheme, editedAt: "2026-09-06T01:00:00Z" }),
    deleteMessage: async () => {},
    ...options.api,
  };
  const store = load("src/store/messages.ts", {
    "../data/api": { api },
    "../data/messageCache": {
      loadPlaintextsSync: () => Object.fromEntries(plaintexts), allPlaintexts: async () => Object.fromEntries(plaintexts),
      cacheForChat: async () => [...disk.values()], cachePut: async (m) => { disk.set(m.id, { ...m }); },
      putPlaintext: async (id, _chat, text) => { plaintexts.set(id, text); }, forgetPlaintext: async (id) => { plaintexts.delete(id); },
    },
    "../data/mapping": mapping,
    "../lib/tauri": { isTauri: true, e2eeAvailable: true, takePushPreview: async () => null, e2eeOpen: async () => { throw new Error("no x25519 in tests"); } },
    "../lib/compassMention": { mentionsCompass: () => false },
    "../lib/compassModels": { loadCompassModel: async () => null },
    "../plugins/runtime": { emitMessageReceived() {}, emitMessageSent() {}, transformBeforeSend: async (_, text) => text },
    "./e2ee": { e2ee: { enabledFor: () => true, seal: async (_, s) => "cipher:" + s, open: async (_, s) => { decrypts++; return s.replace("cipher:", ""); }, forgetPeer: async () => {}, openGroup: async () => "g" } },
    "./compassIdentity": { compassUserId: () => "compass" },
    "./session": { session: { user: () => ({ id: "me" }) } },
  }).messagesStore;
  return { store, plaintexts, disk, calls, decrypts: () => decrypts };
}
const tick = () => new Promise(r => setTimeout(r, 0));
let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log("PASS", name); }
await test("plaintext edit replaces the previous text", () => {
  const {store} = setup(); store.ingestDto(dto(1)); store.ingestDto(dto(1, "edited", { editedAt: "2026-09-06T01:00:00Z" }));
  assert.equal(store.state.chat.messages[0].text, "edited");
});
await test("encrypted edit decrypts the new revision; duplicate delivery reuses it", async () => {
  const h = setup(); h.store.ingestDto(dto(1, "cipher:old", { scheme: "olm-v1" })); await tick();
  assert.equal(h.store.state.chat.messages[0].text, "old");
  const edited = dto(1, "cipher:new", { scheme: "olm-v1", editedAt: "2026-09-06T01:00:00Z" });
  h.store.ingestDto(edited); await tick(); assert.equal(h.store.state.chat.messages[0].text, "new");
  h.store.ingestDto(edited); await tick(); assert.equal(h.decrypts(), 2);
});
await test("tombstone clears plaintext and cannot be resurrected by stale delivery", async () => {
  const h = setup(); h.store.ingestDto(dto(1, "cipher:private", { scheme: "olm-v1" })); await tick();
  h.store.ingestDto(dto(1, "", { deleted: true }));
  assert.equal(h.store.state.chat.messages[0].text, "Message deleted");
  assert.equal(h.store.state.chat.messages[0].sourceText, undefined);
  assert.equal(h.plaintexts.has(dto(1).id), false);
  h.store.ingestDto(dto(1)); assert.equal(h.store.state.chat.messages[0].deleted, true);
});
await test("older edit cannot overwrite a newer edit", () => {
  const h = setup(); h.store.ingestDto(dto(1, "new", { editedAt: "2026-09-06T02:00:00Z" }));
  h.store.ingestDto(dto(1, "old", { editedAt: "2026-09-06T01:00:00Z" })); assert.equal(h.store.state.chat.messages[0].text, "new");
});
await test("sender edit survives its encrypted server echo", async () => {
  const h = setup(); h.store.ingestDto(dto(1, "old", { authorId: "me" }));
  await h.store.edit("chat", h.store.state.chat.messages[0], "edited", "peer");
  h.store.ingestDto(dto(1, "cipher:edited", {authorId: "me", scheme: "olm-v1", editedAt: "2026-09-06T01:00:00Z"}));
  assert.equal(h.store.state.chat.messages[0].text, "edited"); assert.equal(h.decrypts(), 0);
});
await test("resync drains more than 200 rows and coalesces concurrent requests", async () => {
  const backlog = Array.from({length: 451}, (_, i) => dto(i));
  const h = setup({listMessages: (_, q) => q.after ? backlog.filter(m => m.id > q.after).slice(0, q.limit) : [dto(0)]});
  await h.store.loadInitial("chat"); h.calls.length = 0;
  await Promise.all([h.store.resync("chat"), h.store.resync("chat")]);
  assert.equal(h.store.state.chat.messages.length, 451); assert.equal(h.calls.length, 3);
});
await test("reopening an already loaded chat requests missed messages", async () => {
  let offline = false;
  const h = setup({listMessages: (_, q) => q.after ? (offline ? [dto(2)] : []) : [dto(1)]});
  await h.store.loadInitial("chat"); offline = true; await h.store.loadInitial("chat");
  assert.deepEqual(h.store.state.chat.messages.map(m => m.id), [dto(1).id, dto(2).id]);
});
await test("failed unsend restores visible content", async () => {
  const h = setup({api: { deleteMessage: async () => {throw new Error("offline");} }});
  h.store.ingestDto(dto(1)); await assert.rejects(h.store.unsend("chat", h.store.state.chat.messages[0]));
  assert.equal(h.store.state.chat.messages[0].text, "old"); assert.equal(h.store.state.chat.messages[0].deleted, false);
});
await test("duplicate ciphertext in flight is decrypted only once", async () => {
  const h = setup(); const encrypted = dto(1, "cipher:once", {scheme: "olm-v1"});
  h.store.ingestDto(encrypted); h.store.ingestDto(encrypted); await tick();
  assert.equal(h.decrypts(), 1); assert.equal(h.store.state.chat.messages[0].text, "once");
});
await test("an in-flight decrypt cannot restore an unsent message", async () => {
  const h = setup(); h.store.ingestDto(dto(1, "cipher:private", {scheme: "olm-v1"}));
  h.store.ingestDto(dto(1, "", {deleted: true})); await tick();
  assert.equal(h.store.state.chat.messages[0].text, "Message deleted"); assert.equal(h.plaintexts.size, 0);
});
console.log(`${tests} regression tests passed`);
process.exit(0);
