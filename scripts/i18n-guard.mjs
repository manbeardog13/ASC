// ============================================================================
// i18n-guard.mjs — fail the build if user-facing TEXT is hardcoded in the UI
// instead of going through t(). This is the tripwire for the "English leaks into
// the Croatian UI" class of bug (paymentChip "Paid", locationMini "No location").
//   usage:  node scripts/i18n-guard.mjs
//   exit 0 = clean, exit 1 = leaks found (prints file:line + the text)
//
// SCOPE (deliberate, v1): rendered TEXT NODES only — the literal text between
// `>` and `<` at the HTML level of a template literal, which is exactly where the
// visible leaks were. A small template-literal-aware lexer is used so JS operators
// (`a > b`, `=>`), comments, and single-quoted SVG icon strings are NOT scanned,
// and `${…}` interpolations are naturally excluded (they lex as JS, not text).
// It does NOT scan attributes (aria-label/placeholder/title) — nested quotes in
// `${…}` make that noisy; a11y-string coverage is a documented non-goal for now.
//
// A flagged text node is any run of ≥2 letters (incl. Croatian) that isn't in
// ALLOW. Put genuine literals in ALLOW, or add `// i18n-ignore` to the line.
// ============================================================================
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Legitimate literal words that never need translating: brand, universal tech
// tokens, units, and accepted Croatian loanwords. Compared case-insensitively.
export const ALLOW = new Set([
  "asc", "dot", "qr", "csv", "pwa", "ai", "id", "url", "sms", "ok", "online",
  "mm", "cm", "km", "kg",
]);

const WORD = /[A-Za-zČĆŠŽĐčćšžđ]{2,}/g;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

// A `/` starts a regex literal (vs. division) when the previous significant token
// is not a value — i.e. after these chars, or at the start of an expression.
const REGEX_OK = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const regexAllowed = (prev) => prev === "" || REGEX_OK.has(prev);

// Collect HTML text nodes (literal text between `>` and `<`, at interpolation
// depth 0) from every backtick template literal in `src`. A small lexer tracks
// strings, comments, regex literals, and `${…}` so none of their `<`/`>` leak in.
// Returns [{text, line}]. Assumes no quote char lives inside a `return /…/` regex.
export function textNodes(src) {
  const out = [];
  // frames: {t:'code',brace} | {t:'tpl', inText, buf, line} | {t:'sq'|'dq'}
  const stack = [{ t: "code", brace: 0 }];
  const top = () => stack[stack.length - 1];
  let line = 1, prev = "";   // prev = last significant char at code level (for regex test)
  for (let i = 0; i < src.length; i++) {
    const c = src[i], c2 = src[i + 1];
    if (c === "\n") line++;
    const f = top();

    if (f.t === "sq" || f.t === "dq") {           // inside '...' or "..." — skip
      if (c === "\\") { i++; continue; }
      if ((f.t === "sq" && c === "'") || (f.t === "dq" && c === '"')) { stack.pop(); prev = c; }
      continue;
    }
    if (f.t === "code") {                          // JS code / ${…} interpolation
      if (c === "/" && c2 === "/") { while (i < src.length && src[i] !== "\n") i++; line++; continue; }
      if (c === "/" && c2 === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i++; continue; }
      if (c === "/" && regexAllowed(prev)) {       // regex literal: skip to closing / (mind [char classes])
        i++;
        for (let inClass = false; i < src.length; i++) {
          const d = src[i];
          if (d === "\\") { i++; continue; }
          if (d === "\n") line++;
          else if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) break;
        }
        prev = "/"; continue;
      }
      if (c === "'") { stack.push({ t: "sq" }); continue; }
      if (c === '"') { stack.push({ t: "dq" }); continue; }
      if (c === "`") { stack.push({ t: "tpl", inText: false, buf: "", line }); prev = "`"; continue; }
      if (c === "{") f.brace++;
      else if (c === "}") { if (f.brace === 0 && stack.length > 1) { stack.pop(); prev = "}"; continue; } else f.brace--; }
      if (!/\s/.test(c)) prev = c;
      continue;
    }
    if (f.t === "tpl") {                            // HTML level of a template literal
      if (c === "\\") { if (f.inText) f.buf += (src[i] || "") + (src[i + 1] || ""); i++; continue; }
      if (c === "`") { stack.pop(); prev = "`"; continue; }
      if (c === "$" && c2 === "{") { stack.push({ t: "code", brace: 0 }); i++; prev = ""; continue; }
      if (c === ">") { f.inText = true; f.buf = ""; f.line = line; continue; }
      if (c === "<") { if (f.inText) { out.push({ text: f.buf, line: f.line }); f.inText = false; } continue; }
      if (f.inText) f.buf += c;
    }
  }
  return out;
}

// Scan one source string; return the leaking text nodes [{line, text}].
export function scan(src) {
  const lines = src.split("\n");
  const leaks = [];
  for (const node of textNodes(src)) {
    const text = node.text.replace(ENTITY, " ").trim();
    if (!text) continue;
    if (!(text.match(WORD) || []).some((w) => !ALLOW.has(w.toLowerCase()))) continue;
    if (/\/\/\s*i18n-ignore/.test(lines[node.line - 1] || "")) continue;
    leaks.push({ line: node.line, text: text.replace(/\s+/g, " ") });
  }
  return leaks;
}

// ---- runner (only when executed directly, not when imported by the self-test) ----
function main() {
  const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const viewsDir = join(ROOT, "js", "views");
  const files = [
    join(ROOT, "js", "ui.js"),
    ...readdirSync(viewsDir).filter((f) => f.endsWith(".js")).map((f) => join(viewsDir, f)),
  ];
  const leaks = [];
  for (const file of files) {
    const rel = file.replace(ROOT + "\\", "").replace(ROOT + "/", "").replace(/\\/g, "/");
    for (const l of scan(readFileSync(file, "utf8"))) leaks.push({ rel, ...l });
  }
  if (!leaks.length) {
    console.log(`i18n-guard: clean — ${files.length} UI files, no hardcoded text nodes.`);
    process.exit(0);
  }
  console.error(`i18n-guard: ${leaks.length} hardcoded UI string(s) — wrap in t() or allowlist:\n`);
  for (const l of leaks) console.error(`  ${l.rel}:${l.line}  “${l.text}”`);
  console.error(`\nFix: route through t(key). Genuine literals → ALLOW in this script,`);
  console.error(`or add \`// i18n-ignore\` to the line.`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
