// ============================================================================
// db.js — every database operation. Nothing here renders UI; nothing outside
// this file talks to Supabase. Functions read like English and fail with
// human-readable messages. Field edits queue offline and replay when back.
// ============================================================================
import { supabase } from "./supabaseClient.js";
import { config } from "./config.js";
import { compressImage } from "./images.js";
import { isOnline, enqueue } from "./offline.js";
import { rememberLocation } from "./store.js";

// Turn a Supabase error into a sentence an employee could read.
function fail(error, doing) {
  const message = error?.message || String(error);
  if (/duplicate key|unique/i.test(message)) return new Error("That already exists.");
  if (/Failed to fetch|network|fetch failed/i.test(message)) {
    return new Error(`No connection while trying to ${doing}. It will retry when you're back online.`);
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
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
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
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
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
  const { data } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", session.user.id).maybeSingle();
  // No profile row => least-privilege 'readonly', matching asc_role(). The shop
  // owner is forced to 'admin' by schema.sql.
  return data ?? { id: session.user.id, email: session.user.email, role: "readonly", full_name: null };
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
    return rpc.data.map((u) => ({ ...u, pending: false }));
  }
  const { data, error } = await supabase.from("profiles").select("id, full_name, role, email");
  if (error) throw fail(error, "load the user list");
  return (data ?? []).map((u) => ({
    id: u.id, full_name: u.full_name, role: u.role,
    email_masked: maskEmail(u.email), is_owner: isOwnerEmail(u.email), pending: false,
  }));
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

// Everything currently in the shop (recycle-bin rows excluded).
export async function listStorageSets() {
  const { data, error } = await supabase.from("storage_sets")
    .select(SET_LIST_COLUMNS)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
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
export async function createStorageSet(form) {
  const { data: customer, error: cErr } = await supabase.from("customers")
    .insert({ name: form.customer.name, phone: form.customer.phone || null, email: form.customer.email || null })
    .select().single();
  if (cErr) throw fail(cErr, "save the customer");

  const { data: vehicle, error: vErr } = await supabase.from("vehicles")
    .insert({ customer_id: customer.id, make: form.vehicle.make || null, model: form.vehicle.model || null,
      year: form.vehicle.year || null, plate: form.vehicle.plate || null }).select().single();
  if (vErr) throw fail(vErr, "save the vehicle");

  const { data: set, error: sErr } = await supabase.from("storage_sets")
    .insert({
      vehicle_id: vehicle.id, season: form.set.season, on_rims: form.set.on_rims,
      rim_type: form.set.on_rims ? form.set.rim_type || null : null, quantity: form.set.quantity,
      zone: form.set.zone || null, rack: form.set.rack || null, shelf: form.set.shelf || null, slot: form.set.slot || null,
      check_in_date: form.set.check_in_date || null, expected_out_date: form.set.expected_out_date || null,
      fee: form.set.fee ?? null, paid: form.set.paid, notes: form.set.notes || null,
    }).select().single();
  if (sErr) throw fail(sErr, "save the tire set");

  const tires = toTireRows(set.id, form.tires);
  if (tires.length) {
    const { error: tErr } = await supabase.from("tires").insert(tires);
    if (tErr) throw fail(tErr, "save the tire details");
  }

  rememberLocation(form.set);
  return set.public_code;
}

function toTireRows(setId, tires) {
  return (tires ?? [])
    .filter((t) => t.size || t.brand || t.tread_mm || t.dot_code)
    .map((t) => ({
      set_id: setId, position: t.position || null, size: t.size || null,
      brand: t.brand || null, model: t.model || null, tread_mm: t.tread_mm ?? null,
      dot_code: t.dot_code || null, studded: Boolean(t.studded), condition_notes: t.condition_notes || null,
    }));
}

// ---- Updating (offline-queueable) ----------------------------------------------
async function applySetPatch(setId, patch) {
  const { error } = await supabase.from("storage_sets").update(patch).eq("id", setId);
  if (error) throw fail(error, "save the change");
}

export async function updateStorageSet(setId, patch) {
  if (!isOnline()) {
    enqueue({ kind: "updateSet", setId, patch });
    return { queued: true };
  }
  await applySetPatch(setId, patch);
  return { queued: false };
}

// offline.js replays queued mutations through this executor (FIFO).
export async function executeQueuedMutation(mutation) {
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

export async function moveStorageSet(set, newLocation) {
  const occupant = await findSetAtLocation(newLocation, set.id).catch(() => null);
  if (occupant) throw new Error(`${occupant.public_code} is already at that location.`);
  const result = await updateStorageSet(set.id, {
    zone: newLocation.zone || null, rack: newLocation.rack || null,
    shelf: newLocation.shelf || null, slot: newLocation.slot || null,
  });
  rememberLocation(newLocation);
  return result;
}

export async function updateCustomer(customerId, patch) {
  const { error } = await supabase.from("customers").update(patch).eq("id", customerId);
  if (error) throw fail(error, "save the customer");
}
export async function updateVehicle(vehicleId, patch) {
  const { error } = await supabase.from("vehicles").update(patch).eq("id", vehicleId);
  if (error) throw fail(error, "save the vehicle");
}
export async function replaceTires(setId, tires) {
  const { error: delErr } = await supabase.from("tires").delete().eq("set_id", setId);
  if (delErr) throw fail(delErr, "update the tires");
  const rows = toTireRows(setId, tires);
  if (rows.length) {
    const { error } = await supabase.from("tires").insert(rows);
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
export async function listRecycleBin() {
  const { data, error } = await supabase.from("storage_sets")
    .select(SET_LIST_COLUMNS)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw fail(error, "load the recycle bin");
  return data ?? [];
}
export async function purgeSetPermanently(setId) {
  const { error } = await supabase.from("storage_sets").delete().eq("id", setId);
  if (error) throw fail(error, "permanently delete the set");
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
  for (const table of ["customers", "vehicles", "storage_sets", "tires", "photos", "audit_events", "backup_runs"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return channel;
}
export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}
