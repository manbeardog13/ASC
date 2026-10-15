import { proposals, pageFromPath, navigationForText } from './workflow-model.js';

const APP = new URL('./', import.meta.url);
const state = { page: pageFromPath(globalThis.location?.pathname || ''), role: null };
const handlers = new Map(), listeners = new Set(), pending = new Set();
export function setWorkflowContext(patch) { Object.assign(state, patch); notify(); }
export function registerWorkflowAction(id, handler) {
  handlers.set(id, handler); notify();
  return () => { handlers.delete(id); notify(); };
}
export function workflowSnapshot() {
  return { ...proposals(state, [...handlers.keys()]), pending: [...pending] };
}
function notify() { for (const listener of listeners) listener(workflowSnapshot()); }
export function subscribeWorkflow(listener) { listeners.add(listener); listener(workflowSnapshot()); return () => listeners.delete(listener); }
export function workflowHref(path) { return new URL(path, APP).href; }
export function workflowNavigation(text) { return navigationForText(text, state.role); }
export function workflowAgentContext() {
  return { page:state.page, step:state.step || null, setCode:state.set?.public_code || null,
    status:state.set?.status || null, selectedSlot:state.slotQr || null,
    dataState:state.dataState || 'unknown', trial:state.page === 'spatial' };
}
export async function runWorkflowAction(id) {
  const action = workflowSnapshot().actions.find(a => a.id === id);
  if (!action || pending.size) return false;
  if (action.href) { location.assign(workflowHref(action.href)); return true; }
  const handler = handlers.get(action.command);
  if (!handler) return false;
  pending.add(id); notify();
  try { await handler(); return true; }
  finally { pending.delete(id); notify(); }
}

// Persist only the selected code in URLs. No customer details or inventory
// decisions are stored in a second, potentially stale workflow database.
if (typeof document !== 'undefined') {
  document.addEventListener('asc:sign-out', () => { setWorkflowContext({ role: null, set: null }); });
  registerWorkflowAction('search', () => {
    const field = document.querySelector('#workflow-search, #custSearch, #wsSearch, input[type="search"], .searchbox input, .search input');
    if (field) { field.scrollIntoView({ block: 'center' }); field.focus({ preventScroll: true }); }
    else location.assign(workflowHref('locate.html'));
  });
}
