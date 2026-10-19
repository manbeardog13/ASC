// ============================================================================
// db.js — every database operation. Nothing here renders UI; nothing outside
// this file talks to Supabase. Functions read like English and fail with
// human-readable messages. Field edits queue offline and replay when back.
// ============================================================================
import { supabase } from "./supabaseClient.js";
import { config } from "./config.js";
import { compressImage } from "./images.js";
import { isOnline, enqueue, initOffline, replay } from "./offline.js";
import { rememberLocation } from "./store.js";

// Turn a Supabase error into a sentence an employee could read.
function fail(error, doing) {
  const message = error?.message || String(error);
  if (/duplicate key|unique/i.test(message)) return new Error("That already exists.");
  if (/Failed to fetch|network|fetch failed|load failed/i.test(message)) {
    // Honest wording: only queued field-edits auto-retry (updateStorageSet's
    // offline branch, which never reaches here). Everything else did NOT save.
    return new Error(`No connection while trying to ${doing} — nothing was saved. Check the connection and try again.`);
  }
  if (/row-level security|permission/i.test(message)) {
    return new Error(`You don't have permission to ${doing}.`);
  }
  return new Error(`Couldn't ${doing}: ${message}`);
}

// ---- Auth + role ---------------------------------------------------------------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(/Invalid login credentials/.test(error.message)
      ? "Email or password doesn't match."
      : error.message);
  }
}
export async function signOut() {
  await supabase.auth.signOut();
}
// Email a password-reset link. The link returns to the app with type=recovery,
// which app.js routes to the "set your password" screen.
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail((email || "").trim(), { redirectTo: config.APP_BASE_URL });
  if (error) throw new Error(error.message);
}
// Google OAuth. Requires the Google provider enabled in Supabase (Auth →
// Providers) and the app URL listed under Auth → URL Configuration.
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: config.APP_BASE_URL } });
  if (error) {
    throw new Error(/not enabled|unsupported provider|provider/i.test(error.message)
      ? "Google sign-in isn't enabled yet — turn on the Google provider in Supabase."
      : error.message);
  }
}
// Used by the "set your password" screen after an invite/recovery link.
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    // Lands in auth metadata; handle_new_user() copies it into the profile so
    // the app knows who this is from the very first session.
    options: { data: { full_name: (fullName || "").trim() || undefined } },
  });
  if (error) {
    throw new Error(/already registered|already exists/i.test(error.message)
      ? "That email already has an account — sign in instead."
      : error.message);
  }
  // With email confirmation on, no session is returned until the user confirms.
  return { needsConfirm: !data.session };
}
export async function loadMyProfile() {
  const session = await getSession();
  if (!session) return null;
  const base = "id, email, full_name, role, avatar_url";
  let { data, error } = await supabase.from("profiles").select(`${base}, onboarded_at`).eq("id", session.user.id).maybeSingle();
  // The tour column ships in its own migration. Until that is applied, skip the
  // tour instead of failing the profile read that the rest of the app needs.
  if (error && /onboarded_at/i.test(error.message || "")) {
    const retry = await supabase.from("profiles").select(base).eq("id", session.user.id).maybeSingle();
    data = retry.data ? { ...retry.data, onboarding_unavailable: true } : null;
  }
  // Google sign-ins carry the person's name in auth metadata while the profiles
  // row starts empty — adopt it so greetings and the agent know who this is,
  // and persist it (best-effort; ignored if RLS says no).
  const meta = session.user.user_metadata || {};
  const metaName = String(meta.full_name || meta.name || "").trim();
  if (data && !data.full_name && metaName) {
    data.full_name = metaName;
    supabase.from("profiles").update({ full_name: metaName }).eq("id", session.user.id).then(() => {}, () => {});
  }
  // No profile row => least-privilege 'readonly', matching asc_role(). The shop
  // owner is forced to 'admin' by schema.sql.
  return data ?? { id: session.user.id, email: session.user.email, role: "readonly", full_name: metaName || null, onboarding_unavailable: true };
}

// Stamp the first-run tour. Profile writes are admin-only, so this is an RPC.
export async function markOnboarded() {
  const { error } = await supabase.rpc("mark_onboarded");
  if (error) throw fail(error, "finish the introduction");
}

// ---- Access management (admins) ------------------------------------------------
export const OWNER_EMAIL = "cryptonii13@gmail.com";
export const ADMIN_ROLES = ["admin", "manager"];
export function isAdminRole(role) { return ADMIN_ROLES.includes(role); }
export function isOwnerEmail(email) { return (email || "").trim().toLowerCase() === OWNER_EMAIL; }

// c**********@gmail.com — first letter, then stars for the rest of the local
// part, with everything from the @ onward revealed. Mirrors list_users() in SQL.
export function maskEmail(email) {
  const e = (email || "").trim();
  const at = e.indexOf("@");
  if (!e) return "";
  if (at < 1) return e[0] + "***";
  return e[0] + "*".repeat(Math.max(at - 1, 0)) + e.slice(at);
}

// Everyone with an account (masked). Uses the secure directory RPC; falls back to
// reading profiles directly (masking client-side) if the migration isn't re-run yet.
export async function listUsers() {
  const rpc = await supabase.rpc("list_users");
  if (!rpc.error && Array.isArray(rpc.data)) {
    // v4 returns `email` (full, admins only — null otherwise); v3 didn't.
    return rpc.data.map((u) => ({ ...u, pending: false }));
  }
  const { data, error } = await supabase.from("profiles").select("id, full_name, role, email");
  if (error) throw fail(error, "load the user list");
  return (data ?? []).map((u) => ({
    id: u.id, full_name: u.full_name, role: u.role, email: u.email,
    email_masked: maskEmail(u.email), is_owner: isOwnerEmail(u.email), pending: false,
  }));
}

// Set MY display name (the "state your first and last name" gate + self-edit).
// The RPC works for every role; direct table update is the pre-migration fallback
// (admins only under RLS).
// Profile picture: client passes a Blob (already downscaled); stored in the
// public 'avatars' bucket as <uid>.jpg, URL cached-busted + saved on profiles.
export async function setMyAvatar(blob) {
  const session = await getSession();
  if (!session) throw new Error("Prvo se prijavi.");
  const path = session.user.id + ".jpg";
  const { error: upErr } = await supabase.storage.from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (upErr) throw fail(upErr, "save the picture");
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl + "?v=" + Date.now();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", session.user.id);
  if (error) throw fail(error, "save the picture");
  return url;
}

export async function setMyName(fullName) {
  const clean = (fullName || "").trim();
  if (!clean) throw new Error("Name is required.");
  const rpc = await supabase.rpc("set_my_name", { new_name: clean });
  if (!rpc.error) return;
  const session = await getSession();
  const { error } = await supabase.from("profiles").update({ full_name: clean }).eq("id", session.user.id);
  if (error) throw fail(error, "save your name");
}

// Admin: rename any user (pending invites live in allowed_emails).
export async function updateUserName(row, fullName) {
  const clean = (fullName || "").trim();
  if (!clean) throw new Error("Name is required.");
  if (row.pending) {
    const { error } = await supabase.from("allowed_emails").update({ full_name: clean }).eq("email", row.email);
    if (error) throw fail(error, "rename the user");
    return;
  }
  const { error } = await supabase.from("profiles").update({ full_name: clean }).eq("id", row.id);
  if (error) throw fail(error, "rename the user");
}

// Invited-but-not-yet-signed-up users (admin-only table). Returns [] when the
// table is missing or the caller isn't an admin.
export async function listPendingUsers() {
  const { data, error } = await supabase.from("allowed_emails").select("email, full_name, role, created_at");
  if (error) return [];
  return (data ?? [])
    .filter((r) => !isOwnerEmail(r.email))
    .map((r) => ({
      id: "pending:" + r.email, email: r.email, email_masked: maskEmail(r.email),
      full_name: r.full_name, role: r.role, is_owner: false, pending: true,
    }));
}

// Add (invite) a user by allowlisting their email + role. They finish signup.
export async function addAllowedUser({ full_name, email, role }) {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) throw new Error("Email is required.");
  if (isOwnerEmail(clean)) throw new Error("That is the owner account — it already has full access.");
  const { error } = await supabase.from("allowed_emails")
    .upsert({ email: clean, full_name: (full_name || "").trim() || null, role }, { onConflict: "email" });
  if (error) throw fail(error, "add the user");
}

// Call the privileged admin-users Edge Function. Returns { data } on success, or
// { notDeployed: true } if the function isn't deployed (so callers can fall back);
// throws with the function's message on a real error.
async function callAdminFn(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (!error) return { data };
  const status = error?.context?.status;
  if (error.name === "FunctionsFetchError" || status === 404) return { notDeployed: true };
  let msg = error.message;
  try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keep msg */ }
  throw new Error(msg);
}

// Add a user. With the Edge Function deployed this emails a real invite; without
// it, falls back to allowlisting the email for self-signup. mode: invited|exists|allowlist.
export async function inviteUser({ full_name, email, role }) {
  const clean = (email || "").trim().toLowerCase();
  if (!clean) throw new Error("Email is required.");
  if (isOwnerEmail(clean)) throw new Error("That is the owner account — it already has full access.");
  const res = await callAdminFn({ action: "invite", email: clean, full_name, role, appUrl: config.APP_BASE_URL });
  if (res.notDeployed) { await addAllowedUser({ full_name, email: clean, role }); return { mode: "allowlist" }; }
  return { mode: res.data?.status === "exists" ? "exists" : "invited" };
}

// Count of signed-up accounts still awaiting a role (role = readonly). A privacy-
// safe signal for the admin badge; RLS means non-admins only ever see 0.
export async function countPendingApprovals() {
  const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "readonly");
  return error ? 0 : (count ?? 0);
}

export async function setUserRole(row, role) {
  if (row.is_owner) throw new Error("The owner is always an admin.");
  if (row.pending) {
    const { error } = await supabase.from("allowed_emails").update({ role }).eq("email", row.email);
    if (error) throw fail(error, "change the role");
    return;
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", row.id);
  if (error) throw fail(error, "change the role");
}

// Remove a user. Pending invites are withdrawn. For signed-up users, the Edge
// Function deletes the auth login entirely; without it, we fall back to deleting
// the profile (which revokes all access — the account becomes inert). The owner
// can never be removed (enforced here, in the function, and in the database).
export async function removeUser(row) {
  if (row.is_owner) throw new Error("The owner account can't be removed.");
  if (row.pending) {
    const { error } = await supabase.from("allowed_emails").delete().eq("email", row.email);
    if (error) throw fail(error, "remove the user");
    return;
  }
  const res = await callAdminFn({ action: "delete", user_id: row.id });
  if (res.notDeployed) {
    const { error } = await supabase.from("profiles").delete().eq("id", row.id);
    if (error) throw fail(error, "remove the user");
  }
}

// ---- Reading storage sets ------------------------------------------------------
const SET_LIST_COLUMNS = `
  id, public_code, season, on_rims, rim_type, quantity,
  zone, rack, shelf, slot, check_in_date, expected_out_date, picked_up_at, reminded_at,
  fee, paid, status, notes, deleted_at, updated_at, qr_version,
  vehicle:vehicles ( id, make, model, year, plate,
    customer:customers ( id, name, phone, email ) ),
  tires ( size, brand, model, tread_mm, dot_code, position )`;
const SET_LIST_WITH_LOCATION = SET_LIST_COLUMNS.replace(
  "zone, rack, shelf, slot",
  "location_id, zone, rack, shelf, slot",
);

function missingColumn(error, name) {
  return Boolean(error && (error.code === "PGRST204" || error.code === "42703")
    && new RegExp(name, "i").test(error.message || ""));
}

// location_id arrives with the locations migration. Until then the same
// query is retried without that column so lists keep loading.
async function querySetList(apply) {
  let res = await apply(SET_LIST_WITH_LOCATION);
  if (missingColumn(res.error, "location_id")) res = await apply(SET_LIST_COLUMNS);
  return res;
}

// Everything currently in the shop (recycle-bin rows excluded).
export async function listStorageSets() {
  const { data, error } = await querySetList((cols) => supabase.from("storage_sets")
    .select(cols)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false }));
  if (error) throw fail(error, "load the storage list");
  return data ?? [];
}

export async function loadStorageSet(publicCode) {
  const { data, error } = await supabase.from("storage_sets")
    .select(`*, vehicle:vehicles ( *, customer:customers ( * ) ), tires ( * ), photos ( id, path, caption, created_at )`)
    .eq("public_code", publicCode)
    .single();
  if (error) throw fail(error, `find ${publicCode}`);
  const order = { FL: 0, FR: 1, RL: 2, RR: 3, spare: 4 };
  data.tires?.sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9));
  return data;
}

// ---- Dashboard health stats ----------------------------------------------------
export async function countsByStatus() {
  const countWhere = (col, val) => supabase.from("storage_sets")
    .select("id", { count: "exact", head: true }).is("deleted_at", null).eq(col, val);
  const [stored, reserved, pickedUp, missing] = await Promise.all([
    countWhere("status", "in_storage"), countWhere("status", "reserved"),
    countWhere("status", "checked_out"), countWhere("status", "missing"),
  ]);
  return {
    in_storage: stored.count ?? 0, reserved: reserved.count ?? 0,
    checked_out: pickedUp.count ?? 0, missing: missing.count ?? 0,
  };
}

export async function healthStats() {
  const today = new Date().toISOString().slice(0, 10);
  const checkIns = supabase.from("storage_sets").select("id", { count: "exact", head: true })
    .is("deleted_at", null).eq("check_in_date", today);
  const pickups = supabase.from("storage_sets").select("id", { count: "exact", head: true })
    .gte("picked_up_at", today + "T00:00:00").lte("picked_up_at", today + "T23:59:59");
  const inventory = supabase.from("storage_sets").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const lastBackup = supabase.from("backup_runs").select("kind, status, finished_at")
    .order("finished_at", { ascending: false }).limit(1);
  const [ci, pu, inv, lb] = await Promise.all([checkIns, pickups, inventory, lastBackup]);
  return {
    todayCheckIns: ci.count ?? 0,
    todayPickups: pu.count ?? 0,
    inventory: inv.count ?? 0,
    lastBackup: lb.data?.[0] ?? null,
  };
}

// ---- Warehouse-location uniqueness (rule lives here + domain.js) ----------------
export async function findSetAtLocation({ zone, rack, shelf, slot }, excludeSetId = null) {
  if (!zone && !rack && !shelf && !slot) return null;
  let query = supabase.from("storage_sets").select("id, public_code")
    .is("deleted_at", null).eq("status", "in_storage").limit(1);
  for (const [column, value] of Object.entries({ zone, rack, shelf, slot })) {
    query = value ? query.ilike(column, value) : query.is(column, null);
  }
  if (excludeSetId) query = query.neq("id", excludeSetId);
  const { data, error } = await query;
  if (error) throw fail(error, "check the location");
  return data?.[0] ?? null;
}

// Occupancy for the warehouse visualization: every located, in-storage set.
export async function warehouseOccupancy() {
  const { data, error } = await supabase.from("storage_sets")
    .select(`public_code, status, zone, rack, shelf, slot,
      vehicle:vehicles ( plate, customer:customers ( name ) )`)
    .is("deleted_at", null)
    .not("zone", "is", null)
    .order("zone").order("rack").order("shelf").order("slot");
  if (error) throw fail(error, "load the warehouse map");
  return data ?? [];
}

// ---- Duplicate detection (high-signal only, to avoid alert fatigue) -------------
// Warns on matching plate / phone / DOT — NOT tire size, which is too common and
// would train employees to ignore the warning. Returns [{ public_code, reason }].
export async function findPossibleDuplicates({ plate, phone, dotCodes = [] } = {}) {
  const found = new Map();
  const note = (code, reason) => {
    if (!code) return;
    const entry = found.get(code) ?? { public_code: code, reasons: new Set() };
    entry.reasons.add(reason);
    found.set(code, entry);
  };

  const jobs = [];
  if (plate?.trim()) {
    jobs.push(supabase.from("vehicles")
      .select("plate, storage_sets ( public_code, deleted_at )").ilike("plate", plate.trim())
      .then(({ data }) => data?.forEach((v) => v.storage_sets?.forEach((s) => !s.deleted_at && note(s.public_code, "plate")))));
  }
  if (phone?.trim()) {
    jobs.push(supabase.from("customers")
      .select("phone, vehicles ( storage_sets ( public_code, deleted_at ) )").eq("phone", phone.trim())
      .then(({ data }) => data?.forEach((c) => c.vehicles?.forEach((v) => v.storage_sets?.forEach((s) => !s.deleted_at && note(s.public_code, "phone"))))));
  }
  const dots = dotCodes.filter(Boolean);
  if (dots.length) {
    jobs.push(supabase.from("tires")
      .select("dot_code, set:storage_sets ( public_code, deleted_at )").in("dot_code", dots)
      .then(({ data }) => data?.forEach((t) => t.set && !t.set.deleted_at && note(t.set.public_code, "dot"))));
  }

  await Promise.all(jobs).catch(() => {}); // duplicate check is advisory — never blocks check-in
  return [...found.values()].map((e) => ({ public_code: e.public_code, reasons: [...e.reasons] }));
}

// ---- Creating a storage set ----------------------------------------------------
// A payload key the database doesn't know yet (the app updated before a migration
// ran) must never kill a save. PostgREST names the exact column — PGRST204 on
// writes, 42703 elsewhere — so we drop that one field, warn, and save the rest.
const MISSING_COLUMN = /[Cc]ould not find the '([^']+)' column|column "?(?:\w+\.)?(\w+)"?(?: of relation "?\w+"?)? does not exist/;
async function lenientWrite(doing, payload, write) {
  let p = Array.isArray(payload) ? payload.map((r) => ({ ...r })) : { ...payload };
  const dropped = [];
  for (;;) {
    const { data, error } = await write(p);
    if (!error) {
      // Announce dropped columns only once the write has actually landed — never
      // before, or the toast would claim a save that then failed on the retry.
      if (dropped.length) {
        try { window.dispatchEvent(new CustomEvent("asc:save-degraded", { detail: { column: dropped[0], columns: dropped, doing } })); } catch { /* non-DOM */ }
      }
      return data;
    }
    const named = (error.code === "PGRST204" || error.code === "42703")
      ? MISSING_COLUMN.exec(error.message || "") : null;
    const col = named && (named[1] || named[2]);
    const present = col && (Array.isArray(p) ? p.some((r) => col in r) : col in p);
    if (!present) throw fail(error, doing);
    console.warn(`[db] column '${col}' missing in production — ${doing} saved without it`);
    dropped.push(col);
    if (Array.isArray(p)) p.forEach((r) => delete r[col]); else delete p[col];
  }
}

// ---- Failed-create unwind (durable) ---------------------------------------------
// RLS quirk: staff may INSERT storage_sets but only admins may DELETE them, and a
// filtered-out delete returns success with 0 rows. So the unwind soft-deletes the
// set first (allowed to every staff role) — a soft-deleted ghost is invisible to
// lists, counts and location checks — then tries the hard delete, and only touches
// the customer once the set is neutralized. If any step can't be confirmed (e.g.
// the network just died), the ids are parked in localStorage and replayed later.
const UNWIND_KEY = "asc.unwind.pending";
function readUnwinds() {
  try { return JSON.parse(localStorage.getItem(UNWIND_KEY)) ?? []; } catch { return []; }
}
function writeUnwinds(list) {
  try { localStorage.setItem(UNWIND_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
async function unwindCreate({ setId, customerId, vehicleId, ownerId }) {
  const stillOwner = async () => {
    const current = await getSession().catch(() => null);
    return Boolean(ownerId && current?.user?.id === ownerId);
  };
  if (!(await stillOwner())) return false;
  if (setId) {
    const soft = await supabase.from("storage_sets")
      .update({ deleted_at: new Date().toISOString() }).eq("id", setId).select("id");
    if (!(await stillOwner())) return false;
    const hard = await supabase.from("storage_sets").delete().eq("id", setId).select("id");
    const gone = (!hard.error && (hard.data?.length || 0) > 0) || (!soft.error && (soft.data?.length || 0) > 0);
    if (!gone) {
      // Row may already be deleted — confirm before declaring failure.
      const check = await supabase.from("storage_sets").select("id").eq("id", setId).maybeSingle();
      if (check.error || check.data) return false;
    }
  }
  for (const [table, id] of [["vehicles", vehicleId], ["customers", customerId]]) {
    if (!id) continue;
    if (!(await stillOwner())) return false;
    const del = await supabase.from(table).delete().eq("id", id).select("id");
    if (del.error) return false;
    if (!del.data?.length) {
      const check = await supabase.from(table).select("id").eq("id", id).maybeSingle();
      if (check.error || check.data) return false;
    }
  }
  return true;
}
let unwinding = false;
async function replayPendingUnwinds() {
  if (unwinding) return;               // one pass at a time (boot + 'online' can overlap)
  // Unauthenticated, every delete/update is RLS-filtered to a 0-row "success"
  // that would look like a completed unwind and drop the parked job for good.
  // Only run when there is a real session — otherwise leave the jobs parked.
  const session = await getSession().catch(() => null);
  if (!session) return;
  // Legacy jobs without an owner stay parked; a different account must never
  // apply another employee's pending cleanup on a shared warehouse device.
  const pending = readUnwinds().filter((entry) => entry.ownerId === session.user.id);
  if (!pending.length) return;
  unwinding = true;
  try {
    const survivors = [];
    for (const entry of pending) {
      const done = await unwindCreate(entry).catch(() => false);
      if (!done) survivors.push(entry);
    }
    // Merge with anything a concurrent create parked while we were awaiting.
    const key = (entry) => JSON.stringify([entry.ownerId, entry.setId, entry.customerId, entry.vehicleId, entry.at]);
    const attempted = new Set(pending.map(key));
    const added = readUnwinds().filter((entry) => !attempted.has(key(entry)));
    writeUnwinds([...survivors, ...added]);
  } finally { unwinding = false; }
}

export async function createStorageSet(form) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Nije prijavljen — prijavite se prije spremanja.");
  const ownerId = session.user.id;
  const customerPatch = {
    name: form.customer.name, phone: form.customer.phone || null, email: form.customer.email || null,
    address: form.customer.address || null,
  };
  const reusedCustomer = Boolean(form.customer?.id);
  const customer = reusedCustomer
    ? await updateCustomer(form.customer.id, customerPatch).then(() => ({ id: form.customer.id }))
    : await lenientWrite("save the customer", customerPatch,
      (p) => supabase.from("customers").insert(p).select().single());

  // Everything after the customer either fully saves or fully unwinds — a failed
  // check-in must leave nothing behind, or retrying creates duplicate customers.
  // An existing customer or vehicle is updated in place and never deleted here.
  let set;
  let freshVehicleId = null;
  try {
    const vehiclePatch = {
      make: form.vehicle.make || null, model: form.vehicle.model || null,
      year: form.vehicle.year || null, plate: form.vehicle.plate || null,
    };
    const vehicle = form.vehicle?.id
      ? await updateVehicle(form.vehicle.id, vehiclePatch).then(() => ({ id: form.vehicle.id }))
      : await lenientWrite("save the vehicle", {
        ...vehiclePatch, customer_id: customer.id, vin: form.vehicle.vin || null,
      }, (p) => supabase.from("vehicles").insert(p).select().single());
    if (!form.vehicle?.id) freshVehicleId = vehicle.id;

    set = await lenientWrite("save the tire set", {
      vehicle_id: vehicle.id, season: form.set.season, on_rims: form.set.on_rims,
      rim_type: form.set.on_rims ? form.set.rim_type || null : null, quantity: form.set.quantity,
      zone: form.set.zone || null, rack: form.set.rack || null, shelf: form.set.shelf || null, slot: form.set.slot || null,
      check_in_date: form.set.check_in_date || null, expected_out_date: form.set.expected_out_date || null,
      fee: form.set.fee ?? null, paid: form.set.paid, notes: form.set.notes || null,
      bolts_location: form.set.bolts_location || null, hubcaps_location: form.set.hubcaps_location || null,
      hubcaps_stored: form.set.hubcaps_stored != null ? Boolean(form.set.hubcaps_stored) : form.set.hubcaps_location === 'stored',
      ...(form.set.keep_plan ? { keep_plan: form.set.keep_plan } : {}),
      ...(form.set.swap_at ? { swap_at: form.set.swap_at } : {}),
    }, (p) => supabase.from("storage_sets").insert(p).select().single());

    const tires = toTireRows(set.id, form.tires);
    if (tires.length) {
      await lenientWrite("save the tire details", tires,
        (p) => supabase.from("tires").insert(p));
    }
  } catch (e) {
    const job = {
      ownerId,
      vehicleId: freshVehicleId,
      setId: set?.id ?? null,
      customerId: reusedCustomer ? null : customer.id,
      at: new Date().toISOString(),
    };
    const done = await unwindCreate(job).catch(() => false);
    if (!done && (job.setId || job.vehicleId || job.customerId)) writeUnwinds([...readUnwinds(), job]);  // replayed on next boot / reconnect
    throw e;
  }

  rememberLocation(form.set);
  return set.public_code;
}

function toTireRows(setId, tires) {
  return (tires ?? [])
    .filter((t) => t.size || t.brand || t.model || t.tread_mm != null || t.dot_code || t.studded || t.condition_notes)
    .map((t) => ({
      set_id: setId, position: t.position || null, size: t.size || null,
      brand: t.brand || null, model: t.model || null, tread_mm: t.tread_mm ?? null,
      dot_code: t.dot_code || null, studded: Boolean(t.studded), condition_notes: t.condition_notes || null,
    }));
}

// ---- Updating (offline-queueable) ----------------------------------------------
async function applySetPatch(setId, patch) {
  // .select() so we can count the rows the update actually touched: an
  // RLS-filtered write (e.g. an unauthenticated replay) returns 0 rows with NO
  // error, and treating that as success would let the outbox drop the edit.
  const rows = await lenientWrite("save the change", patch,
    (p) => supabase.from("storage_sets").update(p).eq("id", setId).select("id"));
  if (!rows || rows.length === 0) throw new Error("Promjena nije spremljena — nema pristupa ili je zapis uklonjen.");
}

export async function updateStorageSet(setId, patch) {
  if (!isOnline()) {
    const session = await getSession().catch(() => null);
    enqueue({ kind: "updateSet", setId, patch }, session?.user?.id);
    return { queued: true };
  }
  await applySetPatch(setId, patch);
  return { queued: false };
}

// offline.js replays queued mutations through this executor (FIFO). It THROWS
// when there's no session so replay() pauses and keeps the entry — an
// unauthenticated replay would run as anon, RLS-filter the write to a 0-row
// "success", and silently drop the queued edit. applySetPatch's row-count check
// is the second guard for the same failure.
export async function executeQueuedMutation(mutation) {
  const session = await getSession().catch(() => null);
  if (!session?.user?.id || !mutation.ownerId || mutation.ownerId !== session.user.id) {
    throw new Error("Promjena pripada drugoj prijavi — ostaje spremljena na uređaju.");
  }
  if (mutation.kind === "updateSet") return applySetPatch(mutation.setId, mutation.patch);
  console.warn("Unknown queued mutation skipped:", mutation.kind);
}

export async function changeStatus(setId, toStatus) {
  const patch = { status: toStatus };
  if (toStatus === "checked_out") patch.picked_up_at = new Date().toISOString();
  if (toStatus === "reserved") patch.reserved_at = new Date().toISOString();
  if (toStatus === "in_storage") { patch.picked_up_at = null; patch.reserved_at = null; }
  return updateStorageSet(setId, patch);
}

export async function setPaid(setId, paid) {
  return updateStorageSet(setId, { paid });
}

export async function markReminded(setId) {
  return updateStorageSet(setId, { reminded_at: new Date().toISOString() });
}

function rpcMissing(error) {
  return Boolean(error && (error.code === "PGRST202"
    || /could not find the function|schema cache/i.test(error.message || "")));
}
function relationMissing(error) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01"
    || /could not find the table/i.test(error.message || "")));
}
function rpcFail(error, doing) {
  if (rpcMissing(error) || relationMissing(error)) {
    return new Error("Locations are not switched on yet. Apply the locations migration, then try again.");
  }
  const message = error?.message || "";
  if (/already holds|already in a slot|blocked|not found|Scan|Only a stored/i.test(message)) {
    return new Error(message);
  }
  return fail(error, doing);
}

export async function placeSet({ setId = null, publicCode = null, locationId = null, qrCode = null } = {}) {
  const { data, error } = await supabase.rpc("place_set", {
    set_id: setId, public_code: publicCode, location_id: locationId, qr_code: qrCode,
  });
  if (error) throw rpcFail(error, "place the set");
  return data;
}

export async function moveSet({ setId = null, publicCode = null, locationId = null, qrCode = null } = {}) {
  const { data, error } = await supabase.rpc("move_set", {
    set_id: setId, public_code: publicCode, location_id: locationId, qr_code: qrCode,
  });
  if (error) throw rpcFail(error, "move the set");
  return data;
}

// Frees the slot. If the migration is not applied yet, fall back to a status
// change so checkout still records the pickup.
export async function checkoutSet({ setId = null, publicCode = null } = {}) {
  const { data, error } = await supabase.rpc("checkout_set", {
    set_id: setId, public_code: publicCode,
  });
  if (!error) return data;
  if (rpcMissing(error) && setId) {
    await changeStatus(setId, "checked_out");
    return { ok: true, fallback: true, public_code: publicCode };
  }
  throw rpcFail(error, "check the set out");
}

export async function suggestFreeSlot(warehouse = "main", who = {}) {
  const args = { warehouse };
  if (who && who.customerId) args.customer_id = who.customerId;
  if (who && who.phone) args.phone = who.phone;
  if (who && who.plate) args.plate = who.plate;
  const { data, error } = await supabase.rpc("suggest_free_slot", args);
  if (error) throw rpcFail(error, "suggest a free slot");
  return data;
}

// Free slots already recorded on locations. Null when the table is not there yet.
export async function freeSlotsByZone() {
  const { data, error } = await supabase.from("locations").select("zone, status");
  if (relationMissing(error)) return null;
  if (error) throw fail(error, "load free slots");
  const zones = new Map();
  for (const row of data || []) {
    const zone = row.zone || "—";
    const cur = zones.get(zone) || { zone, free: 0, total: 0 };
    cur.total += 1;
    if (row.status === "free") cur.free += 1;
    zones.set(zone, cur);
  }
  return [...zones.values()].sort((a, b) => String(a.zone).localeCompare(String(b.zone)));
}

// Latest placement log. Null when set_movements is not migrated yet.
export async function recentMovements(limit = 6) {
  const { data, error } = await supabase.from("set_movements")
    .select("id, action, created_at, storage_sets(public_code)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (relationMissing(error)) return null;
  if (error) throw fail(error, "load recent movements");
  return data ?? [];
}

// Seats the first-run tour reads so it can name a zone that still has room.
export async function listLocationSeats() {
  const { data, error } = await supabase.from("locations")
    .select("warehouse, zone, rack, shelf, slot, status");
  if (relationMissing(error)) return [];
  if (error) throw fail(error, "list slots");
  return data ?? [];
}

export async function countLocations() {
  const { count, error } = await supabase.from("locations").select("id", { count: "exact", head: true });
  if (relationMissing(error)) return 0;
  if (error) throw fail(error, "count slots");
  return count ?? 0;
}

export async function findLocationByQr(qrCode) {
  const code = String(qrCode || "").trim().toUpperCase();
  if (!code) return null;
  const { data, error } = await supabase.from("locations")
    .select("id, warehouse, zone, rack, shelf, slot, qr_code, status")
    .eq("qr_code", code)
    .maybeSingle();
  if (relationMissing(error)) return null;
  if (error) throw fail(error, "find the slot");
  return data;
}

// Insert missing slots only. ignoreDuplicates keeps an occupied slot occupied.
export async function createLocations(rows) {
  const payload = (rows || []).map((row) => ({
    warehouse: row.warehouse || "main",
    zone: row.zone || "",
    rack: row.rack || "",
    shelf: row.shelf || "",
    slot: row.slot || "",
    status: "free",
  }));
  if (!payload.length) return [];
  const inserted = await supabase.from("locations").upsert(payload, {
    onConflict: "warehouse,zone,rack,shelf,slot",
    ignoreDuplicates: true,
  }).select("id, warehouse, zone, rack, shelf, slot, qr_code, status");
  if (relationMissing(inserted.error)) {
    throw new Error("Locations are not switched on yet. Apply the locations migration, then try again.");
  }
  if (inserted.error) throw fail(inserted.error, "create the slots");
  const warehouse = payload[0].warehouse;
  const zone = payload[0].zone;
  const listed = await supabase.from("locations")
    .select("id, warehouse, zone, rack, shelf, slot, qr_code, status")
    .eq("warehouse", warehouse)
    .eq("zone", zone);
  if (listed.error) return inserted.data ?? [];
  const want = new Set(payload.map((row) => [row.rack, row.shelf, row.slot].join("\0")));
  return (listed.data ?? []).filter((row) => want.has([row.rack, row.shelf, row.slot].join("\0")));
}

export function locationLabel(loc) {
  if (!loc) return "";
  const parts = [loc.zone, loc.rack, loc.shelf, loc.slot].filter((part) => part != null && part !== "");
  const place = parts.join(" · ");
  return loc.qr_code ? (place ? `${place} · ${loc.qr_code}` : loc.qr_code) : place;
}

export async function moveStorageSet(set, newLocation) {
  // The registered slot is authoritative. The RPC locks both slots and changes
  // the location ID, occupancy, text fields and movement log together.
  if (!isOnline()) throw new Error("Za premještanje je potrebna internetska veza.");
  let query = supabase.from("locations").select("id, warehouse, zone, rack, shelf, slot, qr_code, status");
  for (const column of ["zone", "rack", "shelf", "slot"]) {
    query = query.eq(column, String(newLocation[column] || "").trim());
  }
  if (newLocation.warehouse) query = query.eq("warehouse", newLocation.warehouse);
  const { data, error } = await query.limit(2);
  if (error) throw rpcFail(error, "find the destination slot");
  if (!data?.length) throw new Error("Mjesto nije registrirano. Najprije ga izradite u Mjestima pa skenirajte QR oznaku.");
  if (data.length !== 1) throw new Error("Više skladišta ima tu oznaku. Skenirajte QR željenog mjesta.");
  const args = { setId: set.id, publicCode: set.public_code, locationId: data[0].id };
  const result = set.location_id ? await moveSet(args) : await placeSet(args);
  rememberLocation(result?.location || data[0]);
  return result;
}

export async function updateCustomer(customerId, patch) {
  const { data, error } = await supabase.from("customers").update(patch).eq("id", customerId).select("id");
  if (error) throw fail(error, "save the customer");
  if (!data?.length) throw new Error("Kupac nije ažuriran — nema pristupa ili je zapis uklonjen.");
}
export async function updateVehicle(vehicleId, patch) {
  const { data, error } = await supabase.from("vehicles").update(patch).eq("id", vehicleId).select("id");
  if (error) throw fail(error, "save the vehicle");
  if (!data?.length) throw new Error("Vozilo nije ažurirano — nema pristupa ili je zapis uklonjen.");
}
export async function replaceTires(setId, tires) {
  // Insert the new rows FIRST, then delete only the old ids. A failure between
  // the two leaves harmless duplicates (fixed by re-saving) — never zero rows.
  const { data: old, error: oldErr } = await supabase.from("tires").select("id").eq("set_id", setId);
  if (oldErr) throw fail(oldErr, "update the tires");
  const rows = toTireRows(setId, tires);
  if (rows.length) {
    await lenientWrite("update the tires", rows, (p) => supabase.from("tires").insert(p));
  }
  if (old?.length) {
    const { error } = await supabase.from("tires").delete().in("id", old.map((o) => o.id));
    if (error) throw fail(error, "update the tires");
  }
}

// ---- Soft delete / recycle bin / restore ---------------------------------------
export async function softDeleteSet(setId) {
  await applySetPatch(setId, { deleted_at: new Date().toISOString() });
}
export async function restoreSet(setId) {
  await applySetPatch(setId, { deleted_at: null });
}
// Explicit human-selected recovery when the old slot can no longer be used.
// One guarded write restores and unlinks the set atomically; a stale recycle tab
// cannot clear the placement of a set another employee has already restored.
export async function restoreSetUnplaced(setId) {
  const { data, error } = await supabase.from("storage_sets").update({
    deleted_at: null, location_id: null, zone: null, rack: null, shelf: null, slot: null,
  }).eq("id", setId).not("deleted_at", "is", null).select("id");
  if (error) throw fail(error, "restore the set without a location");
  if (!data?.length) throw new Error("Komplet nije vraćen — već je izvan koša ili nemate pristup. Osvježite popis.");
}
export async function listRecycleBin() {
  const { data, error } = await querySetList((cols) => supabase.from("storage_sets")
    .select(cols)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false }));
  if (error) throw fail(error, "load the recycle bin");
  return data ?? [];
}
export async function purgeSetPermanently(setId) {
  // RLS grants hard-delete to admins only; a filtered delete "succeeds" with 0
  // rows — verify the row actually went away instead of toasting a false success.
  const { data, error } = await supabase.from("storage_sets").delete().eq("id", setId).select("id");
  if (error) throw fail(error, "permanently delete the set");
  if (!data || data.length === 0) throw new Error("Samo administrator može trajno obrisati.");
}

// ---- Audit trail ---------------------------------------------------------------
export async function loadAuditTrail(setId) {
  const { data, error } = await supabase.from("audit_events")
    .select("id, at, actor_email, action, summary, changes")
    .eq("entity_id", setId)
    .order("at", { ascending: false })
    .limit(100);
  if (error) throw fail(error, "load the history");
  return data ?? [];
}

// ---- Photos --------------------------------------------------------------------
const PHOTO_BUCKET = "tire-photos";
export async function addPhoto(setId, file) {
  const compressed = await compressImage(file);
  const safe = (compressed.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${setId}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET)
    .upload(path, compressed, { cacheControl: "3600", upsert: false, contentType: compressed.type || "image/jpeg" });
  if (upErr) throw fail(upErr, "upload the photo");
  const { error } = await supabase.from("photos").insert({ set_id: setId, path });
  if (error) throw fail(error, "save the photo");
  return path;
}
export async function deletePhoto(photo) {
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);
  if (error) throw fail(error, "delete the photo");
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
}
export async function signedPhotoUrls(paths, expiresIn = 3600) {
  if (!paths?.length) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw fail(error, "load the photos");
  const urls = {};
  for (const item of data) if (item.signedUrl) urls[item.path] = item.signedUrl;
  return urls;
}

// ---- Customers -----------------------------------------------------------------
export async function listCustomers() {
  const { data, error } = await supabase.from("customers")
    .select(`id, name, phone, email, created_at,
      vehicles ( id, make, model, year, plate,
        storage_sets ( public_code, status, season, deleted_at ) )`)
    .order("name", { ascending: true });
  if (error) throw fail(error, "load customers");
  return data ?? [];
}

// ---- CSV export ----------------------------------------------------------------
export async function listEverythingForExport() {
  const { data, error } = await supabase.from("storage_sets")
    .select(`public_code, status, season, on_rims, rim_type, quantity,
      zone, rack, shelf, slot, check_in_date, expected_out_date, picked_up_at, fee, paid, notes,
      vehicle:vehicles ( make, model, year, plate, customer:customers ( name, phone, email ) ),
      tires ( position, size, brand, model, tread_mm, dot_code, studded )`)
    .is("deleted_at", null)
    .order("public_code", { ascending: true });
  if (error) throw fail(error, "export the inventory");
  return data ?? [];
}

// ---- Realtime ------------------------------------------------------------------
export function subscribeToChanges(onChange) {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) supabase.realtime.setAuth(data.session.access_token);
  });
  const channel = supabase.channel("asc-realtime");
  for (const table of ["customers", "vehicles", "storage_sets", "tires", "photos", "audit_events", "backup_runs", "locations", "set_movements"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return channel;
}
export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}

// ---- Boot wiring -----------------------------------------------------------------
// Every delivered page imports this module, so this is where the offline machinery
// comes alive: online/offline listeners (initOffline is idempotent) plus the outbox
// + unwind replays. Both replays run through session-guarded paths, so it is safe
// that this module also loads on login.html (no session there) — nothing drains
// until the user is actually signed in.
initOffline(executeQueuedMutation, async () => (await getSession().catch(() => null))?.user?.id ?? null);
function flushQueues() {
  replay(executeQueuedMutation).catch(() => {});   // executor is session-gated
  replayPendingUnwinds().catch(() => {});           // session-gated inside
}
// Drain on reconnect and the moment the user signs in (the outbox otherwise waits
// for the next network flap or reload after login).
window.addEventListener("online", flushQueues);
onAuthChange((event) => { if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") flushQueues(); });
// Boot drain only if a session is already restored — avoids a doomed anon attempt.
getSession().then((s) => { if (s) flushQueues(); }).catch(() => {});

// ---- Shared warehouse map (warehouse_areas + warehouse_rack_positions) ----------
// Tables arrive with migration 20261017030000_warehouse_areas.sql. Until it is
// applied, available:false and the map stays device-local. Only these two
// tables are written here; locations, customers, sets and tires are not touched.
export const WAREHOUSE_EDIT_ROLES = ["admin", "manager", "employee", "reception"];
export function canEditWarehouse(role) { return WAREHOUSE_EDIT_ROLES.includes(role); }

export async function listWarehouseLayout() {
  const areas = await supabase.from("warehouse_areas").select("id, warehouse, zone, name, width, depth, unit, updated_at").eq("warehouse", "main");
  if (relationMissing(areas.error)) return { available: false, areas: [], positions: [] };
  if (areas.error) throw fail(areas.error, "load warehouse areas");
  if (!areas.data?.length) return { available: true, areas: [], positions: [] };
  const positions = await supabase.from("warehouse_rack_positions").select("id, area_id, rack, x, z, capacity, updated_at").in("area_id", areas.data.map(area => area.id));
  if (relationMissing(positions.error)) return { available: false, areas: [], positions: [] };
  if (positions.error) throw fail(positions.error, "load rack positions");
  return { available: true, areas: areas.data ?? [], positions: positions.data ?? [] };
}

export async function createWarehouseArea({ zone, name, width, depth, unit, warehouse = "main" }) {
  const { data, error } = await supabase.from("warehouse_areas")
    .insert({ warehouse, zone, name, width, depth, unit }).select("id, zone").single();
  if (error) throw fail(error, "save warehouse area");
  return data;
}

export async function deleteWarehouseArea(id) {
  const { error } = await supabase.from("warehouse_areas").delete().eq("id", id).select("id").single();
  if (error) throw fail(error, "remove warehouse area");
}

export async function saveRackPosition({ area_id, rack, x, z, capacity }) {
  const { data, error } = await supabase.from("warehouse_rack_positions")
    .upsert({ area_id, rack, x, z, capacity }, { onConflict: "area_id,rack" }).select("id").single();
  if (error) throw fail(error, "save rack position");
  return data;
}

export async function moveRackPosition({ from_area_id, to_area_id, rack, x, z }) {
  const { data, error } = await supabase.from("warehouse_rack_positions")
    .update({ area_id: to_area_id, x, z }).eq("area_id", from_area_id).eq("rack", rack).select("id").single();
  if (error) throw fail(error, "move rack position");
  return data;
}
