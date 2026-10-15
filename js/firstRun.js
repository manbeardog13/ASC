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
  ...TOUR_STEPS.flatMap((step) => [step.title, step.body]),
  "flow.needSlotsTitle", "flow.needSlotsBody",
  "flow.unknownSlotTitle", "flow.unknownSlotBody",
  "flow.createSlot", "flow.backToIntake",
];

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
