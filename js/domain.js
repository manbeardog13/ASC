// ============================================================================
// domain.js — single source of truth for ASC business rules.
// Season logic, status logic, warehouse-location rules and payment labels all
// live HERE and nowhere else. UI files render these; db.js persists them.
// ============================================================================

// ---- Statuses ---------------------------------------------------------------
// Stored values are stable identifiers (never rename in the DB); labels are
// what employees read. `tone` maps to a chip style in ui.js — every status is
// also distinguished by its label and icon, never by color alone.
export const STATUSES = {
  in_storage:  { label: "Stored",    tone: "ok",      icon: "box" },
  reserved:    { label: "Reserved",  tone: "info",    icon: "clock" },
  checked_out: { label: "Picked up", tone: "neutral", icon: "check" },
  missing:     { label: "Missing",   tone: "danger",  icon: "alert" },
};
export const STATUS_ORDER = ["in_storage", "reserved", "checked_out", "missing"];

export function statusLabel(status) {
  return STATUSES[status]?.label ?? status ?? "—";
}

// Which one-tap primary action does a set in this status offer next?
export function nextStatusAction(status) {
  if (status === "in_storage")  return { to: "reserved",    label: "Reserve for pickup" };
  if (status === "reserved")    return { to: "checked_out", label: "Mark picked up" };
  if (status === "checked_out") return { to: "in_storage",  label: "Store again" };
  if (status === "missing")     return { to: "in_storage",  label: "Mark found & stored" };
  return null;
}

// ---- Seasons ----------------------------------------------------------------
export const SEASONS = {
  winter:     { label: "Winter",     icon: "snow" },
  summer:     { label: "Summer",     icon: "sun" },
  all_season: { label: "All-season", icon: "circle" },
};
export const SEASON_ORDER = ["winter", "summer", "all_season"];

export function seasonLabel(season) {
  return SEASONS[season]?.label ?? season ?? "—";
}

// The season an employee most likely stores NEXT (cars swap onto the opposite
// set): Oct–Mar people drop off summer tires, Apr–Sep they drop off winter.
export function defaultIncomingSeason(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 4 && month <= 9 ? "winter" : "summer";
}

// ---- Warehouse locations ------------------------------------------------------
// A location is structure (Zone/Rack/Shelf/Slot), never an encoded string.
export function hasLocation(set) {
  return Boolean(set && (set.zone || set.rack || set.shelf || set.slot));
}

export function locationParts(set) {
  return [
    { key: "zone",  label: "Zone",  value: set?.zone  ?? "" },
    { key: "rack",  label: "Rack",  value: set?.rack  ?? "" },
    { key: "shelf", label: "Shelf", value: set?.shelf ?? "" },
    { key: "slot",  label: "Slot",  value: set?.slot  ?? "" },
  ];
}

// One readable line, structured words — used where a block doesn't fit.
export function locationLine(set) {
  if (!hasLocation(set)) return "No location yet";
  return locationParts(set)
    .filter((part) => part.value !== "" && part.value != null)
    .map((part) => `${part.label} ${part.value}`)
    .join(" · ");
}

export function sameLocation(a, b) {
  return ["zone", "rack", "shelf", "slot"].every(
    (key) => String(a?.[key] ?? "").trim().toLowerCase() === String(b?.[key] ?? "").trim().toLowerCase()
  );
}

// Locations must be unique among sets physically in the warehouse.
// `occupant` is the conflicting set (if any) found by db.findSetAtLocation.
export function locationConflictMessage(occupant) {
  if (!occupant) return null;
  return `${occupant.public_code} is already at this location`;
}

// ---- Payment ----------------------------------------------------------------
export function paymentLabel(set) {
  if (set?.fee == null) return null; // no fee agreed — nothing to show
  return set.paid ? "Paid" : "Unpaid";
}

// ---- Pickup planning ----------------------------------------------------------
export function isDueSoon(set, days = 7, today = new Date()) {
  if (!set?.expected_out_date) return false;
  if (set.status === "checked_out") return false;
  const due = new Date(set.expected_out_date + "T00:00:00");
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);
  return due <= horizon;
}

// ---- Tires --------------------------------------------------------------------
export const TIRE_POSITIONS = ["FL", "FR", "RL", "RR", "spare"];
export const COMMON_TIRE_SIZES = [
  "195/65R15", "205/55R16", "205/60R16", "215/55R17",
  "225/45R17", "225/40R18", "235/45R18", "235/35R19",
];
export const TREAD_LEGAL_MIN_MM = 1.6;
export const TREAD_WORN_WARN_MM = 3.0;

export function treadTone(tread_mm) {
  if (tread_mm == null) return "neutral";
  if (tread_mm <= TREAD_LEGAL_MIN_MM) return "danger";
  if (tread_mm <= TREAD_WORN_WARN_MM) return "warn";
  return "ok";
}
