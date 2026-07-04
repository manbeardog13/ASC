// ============================================================================
// domain.js — single source of truth for ASC business rules.
// Season logic, status logic, warehouse-location rules and payment labels all
// live HERE and nowhere else. UI files render these; db.js persists them.
// ============================================================================

import { t } from "./i18n.js";

// ---- Statuses ---------------------------------------------------------------
// Stored values are stable identifiers (never rename in the DB); labels come
// from i18n. `tone` maps to a chip style in ui.js — every status is also
// distinguished by its label and icon, never by color alone.
export const STATUSES = {
  in_storage:  { label: "Stored",    tone: "ok",      icon: "box" },
  reserved:    { label: "Reserved",  tone: "info",    icon: "clock" },
  checked_out: { label: "Picked up", tone: "neutral", icon: "check" },
  missing:     { label: "Missing",   tone: "danger",  icon: "alert" },
};
export const STATUS_ORDER = ["in_storage", "reserved", "checked_out", "missing"];

export function statusLabel(status) {
  return status ? t(`status.${status}`) : "—";
}

// Which one-tap primary action does a set in this status offer next?
export function nextStatusAction(status) {
  if (status === "in_storage")  return { to: "reserved",    label: t("statusAction.reserved") };
  if (status === "reserved")    return { to: "checked_out", label: t("statusAction.checked_out") };
  if (status === "checked_out") return { to: "in_storage",  label: t("statusAction.in_storage") };
  if (status === "missing")     return { to: "in_storage",  label: t("statusAction.found") };
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
  return season ? t(`season.${season}`) : "—";
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
    { key: "zone",  label: t("loc.zone"),  value: set?.zone  ?? "" },
    { key: "rack",  label: t("loc.rack"),  value: set?.rack  ?? "" },
    { key: "shelf", label: t("loc.shelf"), value: set?.shelf ?? "" },
    { key: "slot",  label: t("loc.slot"),  value: set?.slot  ?? "" },
  ];
}

// One readable line, structured words — used where a block doesn't fit.
export function locationLine(set) {
  if (!hasLocation(set)) return t("loc.none");
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

// ---- Progressive search (one bar, everything) --------------------------------
// Matches across customer / phone / email / plate / size / DOT / location /
// code / notes. Every whitespace-separated term must appear (AND).
export function matchesQuery(set, query) {
  if (!query) return true;
  const vehicle = set.vehicle || {};
  const customer = vehicle.customer || {};
  const haystack = [
    set.public_code, set.zone, set.rack, set.shelf, set.slot, set.notes,
    customer.name, customer.phone, customer.email,
    vehicle.plate, vehicle.make, vehicle.model, vehicle.year,
    locationLine(set),
    ...(set.tires || []).flatMap((tire) => [tire.size, tire.brand, tire.model, tire.dot_code]),
  ].filter(Boolean).join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
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

// Friendly, prefilled reminder text for SMS/email (customer's first name only).
export function reminderMessage(set) {
  const first = (set?.vehicle?.customer?.name || "").split(/\s+/)[0] || t("rem.nameFallback");
  const season = seasonLabel(set?.season).toLowerCase();
  const when = set?.expected_out_date ? t("rem.messageWhen", { date: set.expected_out_date }) : "";
  return t("rem.message", { name: first, season, code: set?.public_code ?? "", when });
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
