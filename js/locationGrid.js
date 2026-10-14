// Expand warehouse / zone / rack / shelf / slot ranges into location rows.
// Numeric ranges keep the width of the longer endpoint (01-03 → 01, 02, 03).

const CAP = 400;

function expandToken(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [""];
  const out = [];
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!range) {
      out.push(part);
      continue;
    }
    const start = Number(range[1]);
    const end = Number(range[2]);
    const width = Math.max(range[1].length, range[2].length);
    const step = start <= end ? 1 : -1;
    for (let n = start; step > 0 ? n <= end : n >= start; n += step) {
      out.push(String(n).padStart(width, "0"));
      if (out.length > CAP) break;
    }
  }
  return out.length ? out : [""];
}

export function expandLocations({ warehouse = "main", zone = "", racks = "", shelves = "", slots = "" } = {}, cap = CAP) {
  const limit = Number.isFinite(cap) && cap > 0 ? cap : CAP;
  const rackList = expandToken(racks);
  const shelfList = expandToken(shelves);
  const slotList = expandToken(slots);
  const rows = [];
  for (const rack of rackList) {
    for (const shelf of shelfList) {
      for (const slot of slotList) {
        rows.push({
          warehouse: String(warehouse || "main").trim() || "main",
          zone: String(zone || "").trim(),
          rack, shelf, slot,
        });
        if (rows.length > limit) {
          const error = new Error(`Too many slots. Cap is ${limit}.`);
          error.code = "location_cap";
          error.cap = limit;
          throw error;
        }
      }
    }
  }
  return rows;
}
