// Client-reported activity, not a transactional audit or proof of physical work.
// No local persistence, retries, free-text payloads, or provider calls.
const kinds = new Set(['checkin', 'checkout', 'move', 'print', 'login']);
const identifiers = new Set(['location_id', 'customer_id']);
export function activityRow({ kind, entity, entity_id, payload = {} }, actor) {
  if (!actor || !kinds.has(kind) || !['set', 'session'].includes(entity)) throw new TypeError('Invalid activity');
  const id = String(entity_id || '');
  if (!id || id.length > 128) throw new TypeError('Invalid activity identity');
  const clean = {};
  for (const key of identifiers) if (typeof payload[key] === 'string' && payload[key].length <= 128) clean[key] = payload[key];
  if (['ok', 'failed', 'offline', 'confirmed'].includes(payload.outcome)) clean.outcome = payload.outcome;
  if (typeof payload.test === 'boolean') clean.test = payload.test;
  return { actor, kind, entity, entity_id: id, payload: clean };
}

export async function emitActivity(client, input) {
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.user?.id) return { recorded: false, reason: 'session-unavailable' };
    if (input.expectedActor && input.expectedActor !== data.session.user.id) return { recorded: false, reason: 'session-changed' };
    const row = activityRow(input, data.session.user.id);
    const result = await client.from('asc_events').insert(row).select('id').single();
    return result.error || !result.data?.id
      ? { recorded: false, reason: 'write-unconfirmed' }
      : { recorded: true, id: result.data.id };
  } catch { return { recorded: false, reason: 'unavailable' }; }
}
