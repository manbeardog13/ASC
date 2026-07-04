// ============================================================================
// store.js — one centralized application state with a tiny observer pattern.
// UI subscribes; db.js and offline.js publish. No scattered globals.
// ============================================================================

const state = {
  session: null,        // Supabase auth session (null = logged out)
  online: navigator.onLine,
  syncPending: 0,       // queued offline mutations awaiting replay
  route: "/",
  sets: [],             // last loaded dashboard rows (offline read fallback)
  setsLoadedAt: null,
  recentLocations: [],  // last used zone/rack/shelf/slot combos (reduce typing)
  refreshView: null,    // active view's "reload your data" callback
};

const listeners = new Map(); // event -> Set<fn>

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  emit("change", state);
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(`store listener for "${event}" failed`, err); }
  });
}

// The active view registers how it refreshes; realtime + offline replay call it.
export function setViewRefresh(fn) {
  state.refreshView = fn;
}
export function refreshActiveView() {
  if (typeof state.refreshView === "function") state.refreshView();
}

// ---- Recent warehouse locations (persisted — reduces typing at check-in) ----
const RECENT_LOCATIONS_KEY = "asc.recentLocations";
const RECENT_LOCATIONS_MAX = 6;

export function loadRecentLocations() {
  try {
    state.recentLocations = JSON.parse(localStorage.getItem(RECENT_LOCATIONS_KEY)) ?? [];
  } catch { state.recentLocations = []; }
  return state.recentLocations;
}

export function rememberLocation({ zone, rack, shelf, slot }) {
  if (!zone && !rack && !shelf && !slot) return;
  const entry = { zone: zone || "", rack: rack || "", shelf: shelf || "", slot: slot || "" };
  const key = JSON.stringify(entry);
  state.recentLocations = [
    entry,
    ...state.recentLocations.filter((loc) => JSON.stringify(loc) !== key),
  ].slice(0, RECENT_LOCATIONS_MAX);
  try { localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(state.recentLocations)); } catch { /* storage full — fine */ }
}
