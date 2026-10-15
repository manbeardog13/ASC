// ============================================================================
// offline.js — connection awareness + a durable outbox for offline edits.
// If the warehouse Wi-Fi drops, field updates (status, payment, location,
// notes) queue in localStorage and replay in order once we're back online.
// Nothing important is ever lost silently.
// ============================================================================
import { getState, setState, emit, refreshActiveView } from "./store.js";

const OUTBOX_KEY = "asc.outbox";

function readOutbox() {
  try {
    const entries = JSON.parse(localStorage.getItem(OUTBOX_KEY)) ?? [];
    return Array.isArray(entries) ? entries : [];
  } catch { return []; }
}
function writeOutbox(entries) {
  // A quota/private-storage error must fail the save, never claim it was queued.
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
  setState({ syncPending: entries.length });
}

export function pendingCount() {
  return readOutbox().length;
}

// Legacy unowned entries stay parked. Ownership cannot safely be inferred from
// whoever next logs in on a shared warehouse device.
export function enqueue(mutation, ownerId) {
  if (!ownerId) throw new Error("Prijavite se prije spremanja promjene bez veze.");
  const entries = readOutbox();
  const queueId = globalThis.crypto?.randomUUID?.()
    || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  entries.push({ ...mutation, ownerId, queueId, queuedAt: new Date().toISOString() });
  writeOutbox(entries);
}

// Re-read after each await: an edit queued while a write is in flight must not
// disappear when that earlier entry is acknowledged. Only this account's owned
// entries are eligible; another account's and legacy entries remain untouched.
let replaying = false;
let resolveOwner = async () => null;
export async function replay(executor) {
  if (replaying) return { flushed: false, remaining: pendingCount() };
  replaying = true;
  try {
    const ownerId = await resolveOwner();
    if (!ownerId) return { flushed: false, remaining: pendingCount() };
    while (true) {
      if (await resolveOwner() !== ownerId) return { flushed: false, remaining: pendingCount() };
      const entry = readOutbox().find((item) => item.ownerId === ownerId && item.queueId);
      if (!entry) return { flushed: true, remaining: pendingCount() };
      try {
        await executor(entry);
        writeOutbox(readOutbox().filter((item) => item.queueId !== entry.queueId || item.ownerId !== ownerId));
      } catch (err) {
        console.warn("outbox replay paused:", err.message);
        return { flushed: false, remaining: pendingCount() };
      }
    }
  } finally { replaying = false; }
}

// ---- Connection watching -----------------------------------------------------
let replayExecutor = null;
let inited = false;

export function initOffline(executor, getOwnerId) {
  replayExecutor = executor;
  if (getOwnerId) resolveOwner = getOwnerId;
  if (inited) return;   // db.js wires this at boot; a second call must not stack listeners
  inited = true;
  setState({ syncPending: pendingCount(), online: navigator.onLine });

  window.addEventListener("online", async () => {
    setState({ online: true });
    emit("connection", { online: true });
    if (replayExecutor && pendingCount()) {
      const result = await replay(replayExecutor);
      if (result.flushed) {
        emit("outbox-flushed");
        refreshActiveView();
      }
    }
  });

  window.addEventListener("offline", () => {
    setState({ online: false });
    emit("connection", { online: false });
  });

  // Try to flush anything left over from a previous session.
  if (navigator.onLine && pendingCount()) {
    replay(executor).then((result) => {
      if (result.flushed) { emit("outbox-flushed"); refreshActiveView(); }
    });
  }
}

export function isOnline() {
  return getState().online;
}
