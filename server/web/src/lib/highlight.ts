// Tiny dependency-free syntax highlighter for the plugin editor. Not a full
// parser — a single-pass tokenizer tuned for JS and JSON that's fast enough
// to run on every keystroke of a small file. Token classes (tok-*) are styled
// in index.css with VS Code Dark+ colours.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const JS_TOKEN_RE = new RegExp(
  [
    "(\\/\\/[^\\n]*)", // 1 line comment
    "(\\/\\*[\\s\\S]*?\\*\\/)", // 2 block comment
    "(`(?:[^`\\\\]|\\\\.)*`)", // 3 template literal
    "(\"(?:[^\"\\\\]|\\\\.)*\")", // 4 double-quoted string
    "('(?:[^'\\\\]|\\\\.)*')", // 5 single-quoted string
    // 6 keyword / literal
    "\\b(const|let|var|function|return|if|else|for|while|new|import|export|from|require|module|async|await|try|catch|finally|throw|true|false|null|undefined|typeof|instanceof|in|of|switch|case|break|continue|class|extends|this|void|delete|do|yield|default|static|get|set)\\b",
    "(\\b\\d+(?:\\.\\d+)?\\b)", // 7 number
  ].join("|"),
  "g",
);

function highlightJS(src: string): string {
  let out = "";
  let last = 0;
  JS_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JS_TOKEN_RE.exec(src))) {
    out += escapeHtml(src.slice(last, m.index));
    const [full, lineComment, blockComment, tpl, dq, sq, kw, num] = m;
    void kw;
    let cls = "tok-k";
    if (lineComment || blockComment) cls = "tok-c";
    else if (tpl || dq || sq) cls = "tok-s";
    else if (num) cls = "tok-n";
    out += `<span class="${cls}">${escapeHtml(full)}</span>`;
    last = m.index + full.length;
  }
  out += escapeHtml(src.slice(last));
  return out;
}

const JSON_TOKEN_RE = new RegExp(
  [
    "(\"(?:[^\"\\\\]|\\\\.)*\"(?=\\s*:))", // 1 object key
    "(\"(?:[^\"\\\\]|\\\\.)*\")", // 2 string
    "(\\b(?:true|false|null)\\b)", // 3 bool / null
    "(\\b\\d+(?:\\.\\d+)?\\b)", // 4 number
  ].join("|"),
  "g",
);

function highlightJSON(src: string): string {
  let out = "";
  let last = 0;
  JSON_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSON_TOKEN_RE.exec(src))) {
    out += escapeHtml(src.slice(last, m.index));
    const [full, key, str, bool, num] = m;
    void str;
    let cls = "tok-s";
    if (key) cls = "tok-jk";
    else if (bool) cls = "tok-jb";
    else if (num) cls = "tok-n";
    out += `<span class="${cls}">${escapeHtml(full)}</span>`;
    last = m.index + full.length;
  }
  out += escapeHtml(src.slice(last));
  return out;
}

export function highlightCode(src: string, filename: string): string {
  if (filename.endsWith(".json")) return highlightJSON(src);
  return highlightJS(src);
}

export function languageOf(filename: string): string {
  if (filename.endsWith(".json")) return "JSON";
  if (filename.endsWith(".css")) return "CSS";
  if (filename.endsWith(".tsx") || filename.endsWith(".ts")) return "TS";
  return "JS";
}

export function isValidFileName(name: string): boolean {
  if (name.length === 0 || name.length > 128) return false;
  if (name.startsWith("/") || name.endsWith("/") || name.includes("//") || name.includes("\\")) return false;
  const segments = name.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return false;
  // Every segment is alphanumeric + . _ - (dots allowed within a segment for
  // extensions, but a segment can't be only dots).
  return segments.every(
    (s) => s.length > 0 && /^[A-Za-z0-9._-]+$/.test(s) && !/^\.+$/.test(s),
  );
}