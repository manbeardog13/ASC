import test from "node:test";
import assert from "node:assert/strict";
import { hasLocale } from "../js/i18n.js";
import {
  TOUR_KEYS, TOUR_STEPS, safeAppReturn, intakeReturn, placeReturn,
  locationsHref, placementNeedsSlots, unknownSlotScan, tourTarget, tourSteps, suggestionNote,
} from "../js/firstRun.js";

test("every tour and slot-gate string exists in English and Croatian", () => {
  assert.equal(TOUR_STEPS.length, 5);
  for (const key of TOUR_KEYS) {
    assert.equal(hasLocale(key), true, key);
  }
});

test("return hops stay inside intake and placement", () => {
  assert.equal(safeAppReturn("checkin.html?place=ASC-2026-0099"), "checkin.html?place=ASC-2026-0099");
  assert.equal(safeAppReturn("place.html?set=ASC-2026-0003#/slot/LOC-ABC"), "place.html?set=ASC-2026-0003#/slot/LOC-ABC");
  assert.equal(safeAppReturn("https://evil.example/checkin.html"), "");
  assert.equal(safeAppReturn("//evil.example/checkin.html"), "");
  assert.equal(safeAppReturn("dashboard.html"), "");
  assert.equal(locationsHref("checkin.html?place=ASC-2026-0099"),
    "locations.html?return=" + encodeURIComponent("checkin.html?place=ASC-2026-0099"));
  assert.equal(locationsHref("https://evil.example"), "locations.html");
  assert.equal(intakeReturn("ASC-2026-0099"), "checkin.html?place=ASC-2026-0099");
  assert.equal(placeReturn("ASC-2026-0003"), "place.html?set=ASC-2026-0003");
});

test("the tour names zone 2.1 when it has a free seat, else the next free zone", () => {
  assert.deepEqual(tourTarget([]), { mode: "create", zone: "" });
  assert.deepEqual(tourTarget(null), { mode: "create", zone: "" });
  assert.equal(tourTarget([
    { warehouse: "main", zone: "1", rack: "A", status: "free" },
    { warehouse: "main", zone: "2.1", rack: "A", status: "free" },
  ]).zone, "2.1");
  assert.equal(tourTarget([
    { warehouse: "main", zone: "1", status: "free" },
    { warehouse: "main", zone: "2.1", status: "occupied" },
    { warehouse: "main", zone: "2.2", status: "free" },
    { warehouse: "main", zone: "9", status: "free" },
  ]).zone, "2.2");
  assert.equal(tourTarget([
    { warehouse: "main", zone: "1", status: "free" },
    { warehouse: "main", zone: "2.1", status: "occupied" },
  ]).zone, "1");
  assert.equal(tourTarget([
    { warehouse: "main", zone: "2.1", status: "occupied" },
  ]).mode, "create");
  const named = tourSteps({ mode: "zone", zone: "2.2" });
  assert.equal(named[0].title, "tour.zone.title");
  assert.equal(named[0].vars.zone, "2.2");
  assert.equal(named.length, 5);
  assert.equal(tourSteps({ mode: "create" })[0].title, "tour.s1.title");
});

test("a clustered seat says why, and a plain seat does not", () => {
  assert.deepEqual(suggestionNote({ near_label: "2.1-A-03" }, "ignored"), {
    key: "flow.suggestedNear",
    vars: { where: "2.1-A-03" },
  });
  assert.equal(suggestionNote({ zone: "C" }, "C · 01").key, "flow.suggested");
});

test("placement blocks only an empty rack or an unknown slot label", () => {
  assert.equal(placementNeedsSlots(0), true);
  assert.equal(placementNeedsSlots(1), false);
  assert.equal(placementNeedsSlots(null), false);
  assert.equal(unknownSlotScan("LOC-DEADBEEF0001", null), true);
  assert.equal(unknownSlotScan("LOC-DEADBEEF0001", { qr_code: "LOC-DEADBEEF0001" }), false);
  assert.equal(unknownSlotScan("", null), false);
});
