// Map a live storage location onto the warehouse map.
// No floors or racks are hardcoded: a set is pinned only when its zone is a
// real area on the map and its rack names an existing stack. Otherwise the
// pin carries just the text location (stackId null, areaId null).

export function pinForSet(row, stacks = [], areaIds = []) {
  const list = Array.isArray(stacks) ? stacks : [];
  const zone = String(row?.zone ?? "").trim();
  const known = new Set([...(Array.isArray(areaIds) ? areaIds : []), ...list.map((item) => item?.areaId).filter(Boolean)]);
  const areaId = zone && known.has(zone) ? zone : null;
  const rack = String(row?.rack ?? "").trim().toUpperCase().replace(/\s+/g, "");
  let stackId = null;
  let approx = true;
  if (areaId && rack) {
    const numbered = rack.match(/^(?:.+-)?S?(\d+)$/);
    const candidates = [`${areaId}-${rack}`, rack];
    if (numbered) candidates.push(`${areaId}-S${String(Number(numbered[1])).padStart(3, "0")}`);
    const stack = list.find((item) => item?.areaId === areaId && candidates.includes(String(item.id).toUpperCase()));
    if (stack) { stackId = stack.id; approx = false; }
  }
  const where = [row?.zone, row?.rack, row?.shelf, row?.slot].filter((part) => part != null && part !== "").join(" · ");
  return {
    areaId,
    stackId,
    approx,
    where,
    label: [row?.public_code, where].filter(Boolean).join(" · "),
  };
}
