const FAILURE_THRESHOLD = 3;
const OPEN_TTL_MS = 60_000;

type State = { failures: number; openedAt: number | null };
const circuits = new Map<string, State>();

/** Returns true if the circuit is open (requests should be blocked). */
export function isOpen(key: string): boolean {
  const s = circuits.get(key);
  if (!s?.openedAt) return false;
  if (Date.now() - s.openedAt >= OPEN_TTL_MS) {
    // TTL expired → half-open: let one probe through
    s.openedAt = null;
    return false;
  }
  return true;
}

/** Call on successful response to reset the circuit. */
export function recordSuccess(key: string): void {
  circuits.delete(key);
}

/**
 * Call on a hard failure.
 * Pass `immediate=true` for unambiguous source-wide blocks (403, 520–527) —
 * opens the circuit on the first failure instead of waiting for the threshold.
 * Returns true the moment the circuit first opens.
 */
export function recordFailure(key: string, immediate = false): boolean {
  let s = circuits.get(key);
  if (!s) { s = { failures: 0, openedAt: null }; circuits.set(key, s); }
  if (s.openedAt !== null) return false; // already open, nothing new
  s.failures++;
  if (immediate || s.failures >= FAILURE_THRESHOLD) {
    s.openedAt = Date.now();
    return true;
  }
  return false;
}

/** Returns all sourceIds whose circuit is currently open. */
export function getOpenCircuits(): string[] {
  const now = Date.now();
  const result: string[] = [];
  for (const [key, state] of circuits) {
    if (state.openedAt !== null && now - state.openedAt < OPEN_TTL_MS) {
      result.push(key);
    }
  }
  return result;
}

/** Manually reset a circuit (e.g. on explicit user Retry). */
export function reset(key: string): void {
  circuits.delete(key);
}
