// ============================================================================
// i18n-guard.test.mjs — proves the guard has TEETH (catches real leaks) and
// DISCIPLINE (ignores JS operators, comments, SVG strings, interpolations).
// If someone ever weakens the lexer, this fails in CI before the guard can go
// quiet on a real leak.  usage:  node scripts/i18n-guard.test.mjs
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan } from "./i18n-guard.mjs";

let pass = 0, fail = 0;
const check = (name, src, wantLeak) => {
  const got = scan(src).length > 0;
  if (got === wantLeak) pass++;
  else { fail++; console.error(`FAIL ${name}: wantLeak=${wantLeak} got=${JSON.stringify(scan(src))}`); }
};

// --- SHOULD FIRE (real leaks) ---
check("english chip label",   'return `<span class="chip">Paid</span>`;', true);
check("english text node",    'return `<div class="loc-empty">No location</div>`;', true);
check("croatian literal",     'return `<span>Spremljeno</span>`;', true);
check("leak after interp",    'return `<span>${icon("check",14)}Unpaid</span>`;', true);
check("multiword sentence",   'x.innerHTML = `<p>Something went wrong</p>`;', true);

// --- SHOULD STAY QUIET (legit) ---
check("goes through t()",     'return `<span>${esc(t("pay.paid"))}</span>`;', false);
check("t with vars object",   'return `<b>${t("dash.setsN", { n: 3, sets: "x" })}</b>`;', false);
check("js comparison",        'if (a > b && c < d) return count;', false);
check("arrow function",       'const f = (x) => x > 0 ? `<i>${x}</i>` : "";', false);
check("line comment prose",   '// Store tires here, then Paid\nreturn `<div>${t("x")}</div>`;', false);
check("single-quoted svg",    "const p = '<path d=\"M4 8h2\"/><circle/>';", false);
check("regex with quotes",    'return String(v).replace(/[&<>"\']/g, (c) => M[c]);', false);
check("allowlisted DOT",      'return `<span>DOT</span>`;', false);
check("unit mm",              'return `<b>${v}mm</b>`;', false);
check("symbols only",         'return `<span class="v">→</span>`;', false);
check("i18n-ignore escape",   'return `<span>LiteralOK</span>`; // i18n-ignore', false);
check("whitespace node",      'return `<div>\n   </div>`;', false);

// --- TEETH on the real file: reintroduce the exact original bug in-memory ---
const uiSrc = readFileSync(fileURLToPath(new URL("../js/ui.js", import.meta.url)), "utf8");
const needle = '${esc(t("pay.paid"))}';
if (!uiSrc.includes(needle)) { fail++; console.error("FAIL real-file: paymentChip no longer uses t() as expected"); }
else {
  check("real ui.js is clean", uiSrc, false);
  check("real ui.js with bug reintroduced", uiSrc.replace(needle, "Paid"), true);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
