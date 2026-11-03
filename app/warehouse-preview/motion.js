/* Pure camera motion: no timers, DOM, rendering, or inventory mutations. */
export const IDLE_DELAY_MS = 120000;
export const NEIGHBOR_OPACITY = 0.15;
const copy = value => value.map(Number);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const easeOut = t => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
export const travelDuration = distance => Math.max(620, Math.min(1500, 620 + Math.max(0, distance) * 23));

export function createMotion({ now = 0, reducedMotion = false } = {}) {
  let lastActivity = now, blocked = false, hidden = false, reduced = reducedMotion;
  let flight = null, orbit = null, mode = 'manual';
  const cancel = () => { flight = orbit = null; mode = 'manual'; };
  const allowed = () => !blocked && !hidden && !reduced;
  return {
    activity(time) { lastActivity = time; cancel(); },
    setGuards(values, time) {
      if ('blocked' in values) blocked = !!values.blocked;
      if ('hidden' in values) hidden = !!values.hidden;
      if ('reducedMotion' in values) reduced = !!values.reducedMotion;
      if (!allowed()) cancel();
      lastActivity = time;
    },
    idleDue(time) { return allowed() && mode === 'manual' && time - lastActivity >= IDLE_DELAY_MS; },
    idleRemaining(time) { return Math.max(0, IDLE_DELAY_MS - (time - lastActivity)); },
    fly({ position, target, toPosition, toTarget, time, duration = 680, orbitAfter = false, idle = false }) {
      cancel();
      lastActivity = time;
      if (reduced || duration <= 0) return { position: copy(toPosition), target: copy(toTarget) };
      flight = { position: copy(position), target: copy(target), toPosition: copy(toPosition), toTarget: copy(toTarget), time, duration, orbitAfter, idle };
      mode = idle ? 'idle-flight' : 'flight';
      return null;
    },
    sample(time) {
      if (flight) {
        const f = flight, t = Math.min(1, Math.max(0, (time - f.time) / f.duration));
        const frame = { position: mix(f.position, f.toPosition, easeOut(t)), target: mix(f.target, f.toTarget, easeOut(t)) };
        if (t === 1) {
          flight = null;
          if (f.orbitAfter && allowed()) {
            orbit = { position: f.toPosition, target: f.toTarget, time, speed: f.idle ? .009 : .045 };
            mode = f.idle ? 'idle' : 'orbit';
          } else mode = 'manual';
        }
        return frame;
      }
      if (orbit) {
        // Integrated exponential acceleration starts with zero angular velocity.
        const t = Math.max(0, (time - orbit.time) / 1000), angle = orbit.speed * (t - 2 * (1 - Math.exp(-t / 2)));
        const dx = orbit.position[0] - orbit.target[0], dz = orbit.position[2] - orbit.target[2];
        return { position: [orbit.target[0] + dx * Math.cos(angle) + dz * Math.sin(angle), orbit.position[1], orbit.target[2] + dz * Math.cos(angle) - dx * Math.sin(angle)], target: copy(orbit.target) };
      }
      return null;
    },
    cancel,
    get state() { return { mode, lastActivity, blocked, hidden, reducedMotion: reduced, active: !!(flight || orbit) }; },
  };
}

export function resolveFocusedTires(tires, { setId, tireIds = [] } = {}) {
  const explicit = new Set(tireIds);
  return new Set((tires || []).filter(tire => explicit.has(tire.id) || (setId != null && String(tire.setId) === String(setId))).map(tire => tire.id));
}
