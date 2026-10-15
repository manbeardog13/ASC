// Map a live storage location onto the schematic warehouse preview.
// Zones 2.1 / 2.2 / 2.3 are those floors. Anything else lands on 2.1
// and is marked approximate. A rack like S025 or 2.3-S025 selects that
// stack when it exists in the demo geometry.

const FLOORS = new Set(["2.1", "2.2", "2.3"]);

export function pinForSet(row, stacks = []) {
  const zone = String(row?.zone ?? "").trim();
  const areaId = FLOORS.has(zone) ? zone : "2.1";
  const rack = String(row?.rack ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const numbered = rack.match(/^(?:2\.[123]-)?S?(\d+)$/);
  let stackId = null;
  let approx = true;
  if (numbered) {
    const id = `${areaId}-S${String(Number(numbered[1])).padStart(3, "0")}`;
    const stack = stacks.find((item) => item.id === id && (!item.areaId || item.areaId === areaId));
    if (stack) {
      stackId = stack.id;
      // Matching labels identify a demo stack, never a surveyed real position.
      approx = true;
    }
  }
  if (!stackId) {
    const first = stacks.find((item) => item.areaId === areaId) || stacks[0];
    stackId = first?.id || null;
    approx = true;
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
