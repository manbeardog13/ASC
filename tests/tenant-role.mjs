import test from "node:test";
import assert from "node:assert/strict";
import { readNeroSession, roleFor, canManagePeople, loadTenantRole, applyTenantAccess, clearNeroSession, _resetTenantRoleCache, SESSION_KEY, PEOPLE_URL } from "../js/tenantRole.js";

const store = (v) => ({ getItem: (k) => (k === SESSION_KEY ? (v == null ? null : JSON.stringify(v)) : null) });
const good = { v: 1, access_token: "tok-abc", expires: Date.now() + 60_000 };

test("session: only a valid, unexpired v1 session is read", () => {
  assert.equal(readNeroSession(store(null)), null);
  assert.equal(readNeroSession(store({ ...good, expires: 1 })), null);
  assert.equal(readNeroSession(store({ ...good, v: 2 })), null);
  assert.equal(readNeroSession({ getItem: () => "{bad" }), null);
  assert.equal(readNeroSession(store(good)).access_token, "tok-abc");
});

test("roleFor picks the asc row and rejects unknown roles", () => {
  assert.equal(roleFor([{ tenant: "other", role: "tenant_admin" }, { tenant: "asc", role: "staff" }]), "staff");
  assert.equal(roleFor([{ tenant: "asc", role: "god" }]), null);
  assert.equal(roleFor(null), null);
});

test("only tenant_admin (and Nero operator) may see People", () => {
  assert.ok(canManagePeople("tenant_admin"));
  assert.ok(canManagePeople("operator"));
  for (const r of ["manager", "staff", "viewer", null, undefined]) assert.equal(canManagePeople(r), false);
  assert.equal(PEOPLE_URL, "https://app.nerosummit.com/tenant/?t=asc");
});

test("loadTenantRole calls tenant_my_tenants and fails closed", async () => {
  _resetTenantRoleCache();
  let calls = 0;
  const ok = async (url, init) => { calls++; assert.match(url, /\/rest\/v1\/rpc\/tenant_my_tenants$/); assert.equal(init.headers.Authorization, "Bearer tok-abc");
    return { ok: true, json: async () => [{ tenant: "asc", role: "tenant_admin" }] }; };
  assert.equal(await loadTenantRole({ storage: store(good), fetchImpl: ok }), "tenant_admin");
  assert.equal(await loadTenantRole({ storage: store(good), fetchImpl: ok }), "tenant_admin");
  assert.equal(calls, 1);
  _resetTenantRoleCache();
  let failed = 0;
  const failThenOk = async (url, init) => {
    failed++;
    if (failed === 1) return { ok: false, json: async () => ({}) };
    return ok(url, init);
  };
  assert.equal(await loadTenantRole({ storage: store(good), fetchImpl: failThenOk }), null);
  assert.equal(await loadTenantRole({ storage: store(good), fetchImpl: failThenOk }), "tenant_admin");
  assert.equal(failed, 2);
  _resetTenantRoleCache();
  assert.equal(await loadTenantRole({ storage: store(good), fetchImpl: async () => { throw Error("net"); } }), null);
  assert.equal(await loadTenantRole({ storage: store(null), fetchImpl: ok }), null);
});

test("clearNeroSession drops the token and the cached role", async () => {
  const items = { [SESSION_KEY]: JSON.stringify(good) };
  const storage = { getItem: (k) => items[k] ?? null, removeItem: (k) => { delete items[k]; } };
  _resetTenantRoleCache();
  const ok = async () => ({ ok: true, json: async () => [{ tenant: "asc", role: "tenant_admin" }] });
  assert.equal(await loadTenantRole({ storage, fetchImpl: ok }), "tenant_admin");
  clearNeroSession(storage);
  assert.equal(storage.getItem(SESSION_KEY), null);
  assert.equal(await loadTenantRole({ storage, fetchImpl: ok }), null);
});

test("applyTenantAccess hides by default and shows for tenant_admin", () => {
  const el = { hidden: false };
  const root = { querySelectorAll: () => [el] };
  applyTenantAccess(root, null); assert.equal(el.hidden, true);
  applyTenantAccess(root, "staff"); assert.equal(el.hidden, true);
  applyTenantAccess(root, "tenant_admin"); assert.equal(el.hidden, false);
});
