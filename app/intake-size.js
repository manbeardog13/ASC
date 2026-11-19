// Quick size is a default for tire rows the operator has not edited.
// A rejected submit must not freeze the first default: the next attempt
// reads the field again. An explicit size on a row stays put.

export function nextTireSizes(rows, quick) {
  const value = String(quick || '').trim();
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const current = row || {};
    if (current.explicit) return { ...current };
    if (!value && !current.fromQuick) return { ...current };
    return { ...current, size: value, fromQuick: Boolean(value), explicit: false };
  });
}

// The saved confirmation and the photo failure are separate. A failed upload
// still confirms the set and keeps a retry instead of navigating away.
export function photoFollowUp({ hasFile, uploaded }) {
  if (!hasFile || uploaded) return { confirm: true, notice: false, stay: false };
  return { confirm: true, notice: true, stay: true };
}
