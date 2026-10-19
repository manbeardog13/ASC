// Map a live storage location onto the warehouse map.
// No floors or racks are hardcoded: a set is pinned only when its zone is a
// real area on the map and its rack is bound to a stack by the operator
// (stack.rack). Legacy stacks with no binding match only an exact
// "<zone>-<rack>" id, and only while no stack in that area is bound.
// Otherwise the pin carries just the text location (stackId null).

export const LOCATION_KEY_MAX = 40;
const KEY_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}._/-]| (?! ))*$/u;

/** One rule everywhere: Unicode NFC, trimmed, inner whitespace collapsed to one space, upper case. */
export function locationKey(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Null when acceptable, otherwise a Croatian message explaining why. */
export function locationKeyProblem(value, what = "Oznaka") {
  const key = locationKey(value);
  if (!key) return `${what} je obavezna.`;
  if (key.length > LOCATION_KEY_MAX) return `${what} je predugačka (najviše ${LOCATION_KEY_MAX} znakova).`;
  if (!KEY_PATTERN.test(key)) return `${what} smije sadržavati slova, brojeve, razmak, točku, crticu, podvlaku i kosu crtu.`;
  return null;
}

export function pinForSet(row, stacks = [], areaIds = []) {
  const list = Array.isArray(stacks) ? stacks.filter((item) => item && typeof item === "object") : [];
  const zone = locationKey(row?.zone);
  const known = [...(Array.isArray(areaIds) ? areaIds : []), ...list.map((item) => item.areaId)].filter(Boolean);
  const areaId = zone ? known.find((id) => locationKey(id) === zone) ?? null : null;
  const rack = locationKey(row?.rack);
  let stackId = null;
  let approx = true;
  if (areaId && rack) {
    const inArea = list.filter((item) => item.areaId === areaId);
    const bound = inArea.find((item) => typeof item.rack === "string" && locationKey(item.rack) === rack);
    const anyBound = inArea.some((item) => typeof item.rack === "string");
    const legacy = !bound && !anyBound
      ? inArea.find((item) => item.rack === undefined && locationKey(item.id) === `${locationKey(areaId)}-${rack}`)
      : null;
    const stack = bound || legacy;
    // An operator binding (stack.rack) is the real position; a legacy id match
    // only selects a schematic stack and stays approximate (main, 80239fa).
    if (stack) { stackId = stack.id; approx = !bound; }
  }
  const where = [row?.zone, row?.rack, row?.shelf, row?.slot].filter((part) => part != null && part !== "").join(" · ");
  return { areaId, stackId, approx, where, label: [row?.public_code, where].filter(Boolean).join(" · ") };
}
