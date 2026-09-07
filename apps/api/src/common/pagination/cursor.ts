export interface Cursor {
  readonly sortValue: string;
  readonly id: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function decodeCursor(raw: string): Cursor | null {
  if (typeof raw !== 'string' || raw.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(raw)) {
    return null;
  }
  try {
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) return null;
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    if (Object.keys(value).length !== 2 || !('sortValue' in value) || !('id' in value)) return null;
    if (
      typeof value.sortValue !== 'string' ||
      typeof value.id !== 'string' ||
      !uuid.test(value.id)
    ) {
      return null;
    }
    return { sortValue: value.sortValue, id: value.id };
  } catch {
    return null;
  }
}

export function encodeCursor(value: Cursor): string {
  const raw = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  if (decodeCursor(raw) === null) throw new Error('Cannot encode invalid or oversized cursor');
  return raw;
}
