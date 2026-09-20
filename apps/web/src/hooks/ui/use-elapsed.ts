import { useSyncExternalStore } from 'react';

const TICK_MS = 1_000;

function subscribe(onTick: () => void): () => void {
  const timer = setInterval(onTick, TICK_MS);
  return () => clearInterval(timer);
}

const still = (): (() => void) => () => undefined;
const seconds = (): number => Math.floor(Date.now() / TICK_MS);
const serverSeconds = (): number => 0;

/**
 * Milliseconds elapsed since a server moment, refreshed every second while `running`. The
 * browser clock only paces the display; a settled duration always comes from the server.
 */
export function useElapsed(since: string | null, running: boolean): number | null {
  const now = useSyncExternalStore(running ? subscribe : still, seconds, serverSeconds);
  const start = since === null ? Number.NaN : Date.parse(since);
  if (Number.isNaN(start)) return null;
  return Math.max(0, now * TICK_MS - start);
}
