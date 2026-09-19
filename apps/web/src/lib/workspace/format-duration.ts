/**
 * Short French duration for the work log: "0,4 s", "12 s", "6 min 34 s", "1 h 02 min". Negative
 * or unusable values read as an empty string so a missing moment shows nothing rather than "0 s".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1).replace('.', ',')} s`;
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(Math.floor(seconds % 60)).padStart(2, '0')} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Duration between two server moments when both are known, otherwise null. */
export function durationBetween(startedAt: number, finishedAt: number | null): number | null {
  if (startedAt <= 0 || finishedAt === null || finishedAt <= 0) return null;
  return Math.max(0, finishedAt - startedAt);
}
