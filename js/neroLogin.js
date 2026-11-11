// Where ASC sends someone who is not signed in.
// Nero Summit is the only sign-in. This repo has no tenant login route on
// app.nerosummit.com (the People screen is an admin page, not the entry),
// and the Nero session hand-off is a same-origin token, not a return URL.
// Nothing user-supplied is appended here.

export const NERO_APP_URL = "https://app.nerosummit.com";

// Same allowlist the login page used: a relative app path, never another site.
const APP_RETURN = /^[a-z-]+(\/index)?\.html(\?[^#]*)?$|^warehouse-preview\/(index\.html)?(\?[^#]*)?$/;

export function safeLoginReturn(value) {
  if (typeof value !== "string" || !value) return "";
  if (!APP_RETURN.test(value) || /^login\.html/.test(value)) return "";
  return value;
}

export function neroLoginUrl() {
  return NERO_APP_URL;
}

// A live session continues into ASC. Anything else goes to Nero, and the
// stored return path is left for the next visit that actually has a session.
export function loginDestination({ session, returnPath } = {}) {
  if (session) return safeLoginReturn(returnPath) || "dashboard.html";
  return neroLoginUrl();
}

export function consumeReturnPath(storage) {
  try {
    const value = storage.getItem("asc.return");
    storage.removeItem("asc.return");
    return safeLoginReturn(value);
  } catch {
    return "";
  }
}

// sessionStorage itself can throw (blocked storage) before any method runs.
export function openLoginStorage(read) {
  try { return read(); }
  catch { return null; }
}

// A storage failure must not turn a live session into a signed-out redirect.
export function continueAfterSession(session, storage) {
  const returnPath = session ? consumeReturnPath(storage) : "";
  return loginDestination({ session, returnPath });
}
