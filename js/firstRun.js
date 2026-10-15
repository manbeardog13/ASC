// Pure decisions for the first-run tour and the intake slot gate.
// No DOM and no database, so the smoke test can import it directly.

export const TOUR_STEPS = [
  { title: "tour.s1.title", body: "tour.s1.body" },
  { title: "tour.s2.title", body: "tour.s2.body" },
  { title: "tour.s3.title", body: "tour.s3.body" },
  { title: "tour.s4.title", body: "tour.s4.body" },
  { title: "tour.s5.title", body: "tour.s5.body" },
];

export const TOUR_KEYS = [
  "tour.kicker", "tour.progress", "tour.next", "tour.done", "tour.skip",
  "tour.zone.title", "tour.zone.body",
  ...TOUR_STEPS.flatMap((step) => [step.title, step.body]),
  "flow.needSlotsTitle", "flow.needSlotsBody",
  "flow.unknownSlotTitle", "flow.unknownSlotBody",
  "flow.createSlot", "flow.backToIntake",
  "flow.suggested", "flow.suggestedNear",
];

// Shop preference. The tour names this zone when it still has a free seat.
export const PREFERRED_TOUR_ZONE = "2.1";

function cmpText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Same key order as suggest_free_slot: warehouse, zone, rack, shelf, slot.
function compareSeat(a, b) {
  for (const key of ["warehouse", "zone", "rack", "shelf", "slot"]) {
    const diff = cmpText(String(a?.[key] || ""), String(b?.[key] || ""));
    if (diff) return diff;
  }
  return 0;
}

function seatFree(row) {
  if (!row || row.free === false) return false;
  if (row.free === true) return true;
  return String(row.status || "") === "free";
}

// Empty rack → the create-a-slot script. Otherwise name 2.1 when it has a
// free seat, else the next zone after 2.1 that does, else the first free zone.
export function tourTarget(rows, preferred = PREFERRED_TOUR_ZONE) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { mode: "create", zone: "" };
  const free = list.filter(seatFree).slice().sort(compareSeat);
  if (!free.length) return { mode: "create", zone: "" };
  if (free.some((row) => String(row.zone || "") === preferred)) {
    return { mode: "zone", zone: preferred };
  }
  const after = free.find((row) => cmpText(String(row.zone || ""), preferred) > 0);
  return { mode: "zone", zone: String((after || free[0]).zone || "") };
}

export function tourSteps(target) {
  const first = target && target.mode === "zone"
    ? { title: "tour.zone.title", body: "tour.zone.body", vars: { zone: target.zone } }
    : TOUR_STEPS[0];
  return [first, ...TOUR_STEPS.slice(1)];
}

// Only a same-app intake or placement URL may be used as a return hop.
const RETURN_OK = /^(checkin|place)\.html(?:\?[^#]*)?(?:#.*)?$/;

export function safeAppReturn(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 400) return "";
  if (!RETURN_OK.test(text)) return "";
  if (text.includes("\\") || text.includes("//") || text.includes("@")) return "";
  return text;
}

export function intakeReturn(code) {
  const clean = String(code || "").trim();
  if (!clean) return "checkin.html";
  return "checkin.html?place=" + encodeURIComponent(clean);
}

export function placeReturn(code) {
  const clean = String(code || "").trim();
  if (!clean) return "place.html";
  return "place.html?set=" + encodeURIComponent(clean);
}

export function locationsHref(returnTo) {
  const back = safeAppReturn(returnTo);
  return back ? "locations.html?return=" + encodeURIComponent(back) : "locations.html";
}

// count === 0 is an empty rack. null/undefined means the count failed; do not block.
export function placementNeedsSlots(count) {
  return count === 0;
}

export function unknownSlotScan(scanned, row) {
  return Boolean(scanned) && !row;
}

// A clustered seat explains itself. Anything else keeps the plain free-slot line.
export function suggestionNote(slot, where) {
  if (slot && slot.near_label) {
    return { key: "flow.suggestedNear", vars: { where: String(slot.near_label) } };
  }
  return { key: "flow.suggested", vars: { where: where || "" } };
}
