// ============================================================================
// prune-backups.mjs — retention policy for the encrypted backup archive.
// Keeps: the last 30 daily, the newest of each of the last 12 months, and the
// newest of each of the last 5 years. Everything else is deleted.
//   usage:  node scripts/prune-backups.mjs <dir>
// Files are named asc-YYYY-MM-DD.<ext> (one per day per directory).
// ============================================================================
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("usage: prune-backups.mjs <dir>"); process.exit(1); }

let files;
try { files = readdirSync(dir); } catch { console.log(`(${dir} does not exist yet — nothing to prune)`); process.exit(0); }

const byDate = new Map(); // YYYY-MM-DD -> filename (last one wins)
for (const f of files.filter((f) => /^asc-\d{4}-\d{2}-\d{2}\./.test(f)).sort()) {
  byDate.set(f.slice(4, 14), f);
}
const dates = [...byDate.keys()].sort();
if (!dates.length) { console.log(`(no backups in ${dir})`); process.exit(0); }

const keep = new Set();
dates.slice(-30).forEach((d) => keep.add(d));                     // 30 daily

const monthly = new Map();
for (const d of dates) monthly.set(d.slice(0, 7), d);            // newest per month
[...monthly.values()].sort().slice(-12).forEach((d) => keep.add(d));

const yearly = new Map();
for (const d of dates) yearly.set(d.slice(0, 4), d);            // newest per year
[...yearly.values()].sort().slice(-5).forEach((d) => keep.add(d));

let removed = 0;
for (const d of dates) {
  if (!keep.has(d)) { unlinkSync(join(dir, byDate.get(d))); removed++; }
}
console.log(`${dir}: kept ${keep.size} of ${dates.length}, removed ${removed}`);
