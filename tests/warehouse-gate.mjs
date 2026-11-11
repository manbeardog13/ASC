import test from "node:test";
import assert from "node:assert/strict";
import { createGate } from "../app/warehouse-preview/gate.js";

function harness({ session, getSession, loadError = false } = {}) {
  const messages = [];
  const ended = [];
  const timers = new Map();
  let nextTimer = 0;
  let visible = true;
  let current = session ?? { user: { id: "user-a" }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const runtime = {
    pause() { runtime.paused = true; },
    resume() { runtime.resumed = true; },
    dispose() { runtime.disposed = true; },
  };
  const auth = {
    async getSession() {
      if (typeof getSession === "function") return getSession();
      return current;
    },
    subscribe(callback) {
      auth.callback = callback;
      return () => { auth.unsubscribed = true; };
    },
  };
  const gate = createGate({
    getAuth: async () => {
      if (loadError) throw new Error("synthetic auth unavailable");
      return auth;
    },
    loadApp: async () => () => runtime,
    present: (ready, text) => messages.push({ ready, text }),
    isVisible: () => visible,
    onSessionEnd: () => ended.push(messages.at(-1)?.text || true),
    now: () => Date.now(),
    setTimer: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  return {
    gate, auth, runtime, messages, ended, timers,
    setSession(next) { current = next; },
    setVisible(value) { visible = value; },
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
  };
}

test("warehouse sign-out and account changes call the shared session-end helper", async () => {
  const signedOut = harness();
  await signedOut.gate.check();
  assert.equal(signedOut.ended.length, 0);
  signedOut.auth.callback("SIGNED_OUT", null);
  assert.equal(signedOut.ended.length, 1);
  assert.equal(signedOut.runtime.disposed, true);

  const changed = harness();
  await changed.gate.check();
  changed.setSession({ user: { id: "user-b" }, expires_at: Math.floor(Date.now() / 1000) + 3600 });
  await changed.gate.check();
  assert.equal(changed.ended.length, 1);

  const expired = harness();
  await expired.gate.check();
  const expiry = [...expired.timers.values()].at(-1);
  expiry();
  assert.equal(expired.ended.length, 1);
});

test("a failed load or hidden-tab pause does not clear the Nero session", async () => {
  const failed = harness({ loadError: true });
  await failed.gate.check();
  assert.equal(failed.ended.length, 0);
  assert.match(failed.messages.at(-1).text, /nije učitan|nije ucitan|Ponovno/i);

  const hidden = harness();
  await hidden.gate.check();
  hidden.setVisible(false);
  hidden.gate.suspend();
  assert.equal(hidden.ended.length, 0);
  assert.notEqual(hidden.runtime.disposed, true);
});
