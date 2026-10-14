import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openCount, freeSlots, freeSlotsAfter, encodePlan, decodePlan, mergeNotes,
  inReminderWindow, slotKey, busyKeys, inputZone,
} from '../js/seasonPlan.js';

test('the text window types on the left and listens on the right until there is text', () => {
  assert.equal(inputZone(0.1, false), 'type');
  assert.equal(inputZone(4 / 7 - 0.01, false), 'type');
  assert.equal(inputZone(4 / 7, false), 'voice');
  assert.equal(inputZone(0.99, false), 'voice');
  assert.equal(inputZone(0.9, true), 'edit');
  assert.equal(inputZone(0.1, true), 'edit');
});

test('the corner number is how many database questions are still open', () => {
  assert.equal(openCount({}), 3);
  assert.equal(openCount({ phone: '091', email: '', plan: '' }), 2);
  assert.equal(openCount({ phone: '091', email: 'a@b.hr', plan: 'seasonal' }), 0);
});

test('a seasonal job takes the first free weekday bay about six months out', () => {
  const from = new Date(2026, 9, 14, 15, 0, 0, 0); // Wed 14 Oct 2026
  const [first, second] = freeSlots([], from, 2, 6);
  assert.equal(slotKey(first), '2027-04-14T08:00');
  assert.equal(slotKey(second), '2027-04-14T08:30');
  assert.equal(first.getDay(), 3);
});

test('a taken bay and a weekend are skipped', () => {
  const from = new Date(2026, 9, 17, 9, 0, 0, 0); // Sat → +6 months is Sat 17 Apr 2027
  const busy = new Set(['2027-04-19T08:00']);
  const [first] = freeSlots(busy, from, 1, 6);
  assert.equal(slotKey(first), '2027-04-19T08:30');
  assert.notEqual(first.getDay(), 0);
  assert.notEqual(first.getDay(), 6);
});

test('reschedule offers later free bays and the plan round-trips through notes', () => {
  const current = new Date(2027, 3, 14, 8, 0, 0, 0);
  const next = freeSlotsAfter(['2027-04-14T08:30'], current, 1);
  assert.equal(slotKey(next[0]), '2027-04-14T09:00');
  const marker = encodePlan('seasonal', next[0]);
  const notes = mergeNotes('Poziv prije dolaska', marker);
  assert.match(notes, /Poziv prije dolaska/);
  assert.equal(decodePlan(notes).kind, 'seasonal');
  assert.equal(slotKey(decodePlan(notes).at), '2027-04-14T09:00');
  const again = mergeNotes(notes, encodePlan('indefinite'));
  assert.equal(decodePlan(again).kind, 'indefinite');
  assert.equal(decodePlan(again).at, null);
  assert.doesNotMatch(again, /2027-04-14/);
});

test('the reminder window is five to seven days before the visit', () => {
  const visit = new Date(2027, 3, 19, 11, 30, 0, 0); // Monday
  assert.equal(inReminderWindow(visit, new Date(2027, 3, 12, 9, 0, 0, 0)), true);  // 7 days
  assert.equal(inReminderWindow(visit, new Date(2027, 3, 14, 9, 0, 0, 0)), true);  // 5 days
  assert.equal(inReminderWindow(visit, new Date(2027, 3, 15, 9, 0, 0, 0)), false); // 4 days
  assert.equal(inReminderWindow(visit, new Date(2027, 3, 11, 9, 0, 0, 0)), false); // 8 days
});

test('another set already in that bay is busy, this set is not', () => {
  const keys = busyKeys([
    { id: 'a', status: 'in_storage', notes: '[[asc-plan seasonal 2027-04-14T08:00]]' },
    { id: 'b', status: 'in_storage', notes: '[[asc-plan seasonal 2027-04-14T08:30]]' },
    { id: 'c', status: 'checked_out', notes: '[[asc-plan seasonal 2027-04-14T09:00]]' },
  ], 'b');
  assert.equal(keys.has('2027-04-14T08:00'), true);
  assert.equal(keys.has('2027-04-14T08:30'), false);
  assert.equal(keys.has('2027-04-14T09:00'), false);
});
