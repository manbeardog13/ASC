// ============================================================================
// offline.js — connection awareness + a durable outbox for offline edits.
// If the warehouse Wi-Fi drops, field updates (status, payment, location,
// notes) queue in localStorage and replay in order once we're back online.
// Nothing important is ever lost silently.
// ============================================================================
import { getState, setState, emit, refreshActiveView } from "./store.js";

const OUTBOX_KEY = "asc.outbox";

function readOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) ?? []; }
  catch { return []; }
}
function writeOutbox(entries) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
  setState({ syncPending: entries.length });
}

export function pendingCount() {
  return readOutbox().length;
}

// Queue a mutation: { kind: "updateSet", setId, patch, queuedAt }.
export function enqueue(mutation) {
  const entries = readOutbox();
  entries.push({ ...mutation, queuedAt: new Date().toISOString() });
  writeOutbox(entries);
}

// Replay everything through the executor (db.js supplies it) in FIFO order.
// Stops at the first failure so ordering is preserved for the next attempt.
let replaying = false;
export async function replay(executor) {
  if (replaying) return { flushed: false, remaining: pendingCount() };
  replaying = true;
  try {
  let entries = readOutbox();
  while (entries.length) {
    try {
      await executor(entries[0]);
      entries = entries.slice(1);
      writeOutbox(entries);
    } catch (err) {
      console.warn("outbox replay paused:", err.message);
      return { flushed: false, remaining: entries.length };
    }
  }
  return { flushed: true, remaining: 0 };
  } finally { replaying = false; }
}

// ---- Connection watching -----------------------------------------------------
let replayExecutor = null;

export function initOffline(executor) {
  replayExecutor = executor;
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
