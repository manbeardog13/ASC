// Seasonal bay schedule for a tire hotel.
// One car per half hour, weekdays 08:00–16:00, so a swap does not stack
// onto someone who is already in the bay. Wall times stay local (no Z).

export const PLAN_KINDS = ['seasonal', 'indefinite', 'discard', 'season_keep'];
const MARK = /\[\[asc-plan\s+(seasonal|indefinite|discard|season_keep)(?:\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}))?\]\]/;
const OPEN = 8 * 60;
const CLOSE = 16 * 60;
const STEP = 30;

// Empty field: the left four sevenths types, the right three sevenths is the
// walkie-talkie. Once there is text, the whole field edits and the corner
// is only a send arrow.
export function inputZone(ratio, hasText) {
  if (hasText) return 'edit';
  return ratio < 4 / 7 ? 'type' : 'voice';
}

export function openCount({ phone, email, plan } = {}) {
  let n = 0;
  if (!String(phone || '').trim()) n += 1;
  if (!String(email || '').trim()) n += 1;
  if (!plan) n += 1;
  return n;
}

export function slotKey(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate())
    + 'T' + p(date.getHours()) + ':' + p(date.getMinutes());
}

export function parseWall(stamp) {
  const m = String(stamp || '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
}

export function isoDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

export function formatWhen(date) {
  const day = date.toLocaleDateString('hr-HR', { weekday: 'long' });
  const p = (n) => String(n).padStart(2, '0');
  return day + ' ' + p(date.getHours()) + ':' + p(date.getMinutes());
}

export function addMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1, 8, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  d.setHours(8, 0, 0, 0);
  return d;
}

function isOpen(date) {
  const day = date.getDay();
  const mins = date.getHours() * 60 + date.getMinutes();
  return day !== 0 && day !== 6 && mins >= OPEN && mins < CLOSE && mins % STEP === 0;
}

function advance(date) {
  const n = new Date(date.getTime());
  n.setMinutes(n.getMinutes() + STEP, 0, 0);
  if (n.getHours() * 60 + n.getMinutes() >= CLOSE) {
    n.setDate(n.getDate() + 1);
    n.setHours(8, 0, 0, 0);
  }
  while (n.getDay() === 0 || n.getDay() === 6) {
    n.setDate(n.getDate() + 1);
    n.setHours(8, 0, 0, 0);
  }
  return n;
}

function snapOpen(date) {
  const n = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0, 0, 0);
  if (date.getHours() > 8 || (date.getHours() === 8 && date.getMinutes() > 0)) {
    n.setTime(date.getTime());
    n.setSeconds(0, 0);
    const mins = n.getHours() * 60 + n.getMinutes();
    const rounded = Math.ceil(mins / STEP) * STEP;
    n.setHours(0, rounded, 0, 0);
  }
  while (!isOpen(n)) n.setTime(advance(n).getTime());
  return n;
}

// `busy` is a set of slotKey strings already taken by other jobs.
export function freeSlots(busy, from, count = 1, monthsAhead = 6) {
  const taken = busy instanceof Set ? busy : new Set(busy || []);
  let cursor = snapOpen(addMonths(from, monthsAhead));
  const out = [];
  let guard = 0;
  while (out.length < count && guard < 5000) {
    guard += 1;
    if (isOpen(cursor) && !taken.has(slotKey(cursor))) out.push(new Date(cursor.getTime()));
    cursor = advance(cursor);
  }
  return out;
}

export function freeSlotsAfter(busy, after, count = 3) {
  const taken = busy instanceof Set ? busy : new Set(busy || []);
  let cursor = advance(snapOpen(after));
  const out = [];
  let guard = 0;
  while (out.length < count && guard < 5000) {
    guard += 1;
    if (isOpen(cursor) && !taken.has(slotKey(cursor))) out.push(new Date(cursor.getTime()));
    cursor = advance(cursor);
  }
  return out;
}

export function needsBooking(kind) {
  return kind === 'seasonal' || kind === 'season_keep';
}

export function encodePlan(kind, at) {
  if (!PLAN_KINDS.includes(kind)) return '';
  if (needsBooking(kind)) {
    const stamp = at instanceof Date ? slotKey(at) : String(at || '');
    if (!parseWall(stamp)) return '';
    return '[[asc-plan ' + kind + ' ' + stamp + ']]';
  }
  return '[[asc-plan ' + kind + ']]';
}

export function decodePlan(notes) {
  const m = String(notes || '').match(MARK);
  if (!m) return null;
  return { kind: m[1], at: m[2] ? parseWall(m[2]) : null, stamp: m[2] || null };
}

export function mergeNotes(notes, marker) {
  const base = String(notes || '').replace(/\n?\[\[asc-plan [^\]]+\]\]/g, '').trim();
  if (!marker) return base;
  return base ? base + '\n' + marker : marker;
}

export function busyKeys(sets, exceptId) {
  const keys = new Set();
  for (const set of sets || []) {
    if (exceptId && set.id === exceptId) continue;
    if (set.status === 'checked_out') continue;
    const plan = decodePlan(set.notes);
    if (plan?.stamp) keys.add(plan.stamp);
  }
  return keys;
}

// Staff send the nudge while the visit is still 5, 6, or 7 days out,
// so the customer can move a Monday before the bay is full.
export function daysUntil(appointment, today) {
  const a = new Date(appointment.getFullYear(), appointment.getMonth(), appointment.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
}

export function inReminderWindow(appointment, today) {
  const days = daysUntil(appointment, today);
  return days >= 5 && days <= 7;
}
