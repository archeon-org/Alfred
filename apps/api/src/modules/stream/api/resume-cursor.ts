import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[^\r\n\0]+$/u);
const nonnegativeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const scopeSchema = z
  .object({
    executionId: id,
    invocationId: id,
    generation: z.uuid(),
    projectionVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    schemaVersion: z.literal(1),
  })
  .strict();
const payloadSchema = scopeSchema
  .extend({
    nativePosition: z
      .string()
      .min(1)
      .max(1_024)
      .regex(/^[^\r\n\0]+$/u)
      .nullable(),
    outputSubposition: nonnegativeInteger,
  })
  .strict();
const tokenSchema = payloadSchema.extend({ expiresAt: nonnegativeInteger }).strict();

export type ResumeCursorScope = z.infer<typeof scopeSchema>;
export type ResumeCursorPayload = z.infer<typeof payloadSchema>;
export type ResumeCursor = z.infer<typeof tokenSchema>;
export const MAX_RESUME_CURSOR_LENGTH = 4_096;
export const RESUME_CURSOR_TTL_MS = 60 * 60 * 1_000;

const prefix = 'v1.';
const context = Buffer.from('alfred:execution-resume-cursor:v1');
const ivLength = 12;
const tagLength = 16;

/** Never attach native crypto exceptions, payloads or identifiers to public cursor errors. */
export class ResumeCursorError extends Error {
  readonly code = 'invalid_cursor';

  constructor() {
    super('Resume cursor is invalid or no longer available.');
    this.name = 'ResumeCursorError';
  }
}

function encryptionKey(secret: string): Buffer {
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 1_024) {
    throw new ResumeCursorError();
  }
  // The explicit deployment secret must be randomly generated; hashing is domain separation,
  // not a password KDF. A changed key invalidates old tokens without revealing their contents.
  return createHash('sha256').update(context).update('\0').update(secret).digest();
}

function validTime(now: number): boolean {
  return Number.isSafeInteger(now) && now >= 0;
}

export function createResumeCursor(
  payload: ResumeCursorPayload,
  key: string,
  options: { readonly now?: number; readonly ttlMs?: number } = {},
): string {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? RESUME_CURSOR_TTL_MS;
  const parsed = payloadSchema.safeParse(payload);
  if (
    !parsed.success ||
    !validTime(now) ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1 ||
    ttlMs > 86_400_000 ||
    !validTime(now + ttlMs)
  ) {
    throw new ResumeCursorError();
  }
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(context);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ ...parsed.data, expiresAt: now + ttlMs }), 'utf8'),
    cipher.final(),
  ]);
  const token = prefix + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  if (token.length > MAX_RESUME_CURSOR_LENGTH) throw new ResumeCursorError();
  return token;
}

export function readResumeCursor(
  token: string,
  expectedScope: ResumeCursorScope,
  key: string,
  options: { readonly now?: number } = {},
): ResumeCursor {
  // Bound attacker-controlled input before decoding or cryptographic work. Require canonical
  // base64url because Buffer.from alone tolerates malformed encodings and ignored characters.
  if (
    typeof token !== 'string' ||
    token.length > MAX_RESUME_CURSOR_LENGTH ||
    !/^v1\.[A-Za-z0-9_-]+$/u.test(token)
  ) {
    throw new ResumeCursorError();
  }
  try {
    const now = options.now ?? Date.now();
    const scope = scopeSchema.safeParse(expectedScope);
    const encoded = token.slice(prefix.length);
    const bytes = Buffer.from(encoded, 'base64url');
    if (
      !validTime(now) ||
      !scope.success ||
      bytes.length <= ivLength + tagLength ||
      bytes.toString('base64url') !== encoded
    ) {
      throw new ResumeCursorError();
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(key),
      bytes.subarray(0, ivLength),
    );
    decipher.setAAD(context);
    decipher.setAuthTag(bytes.subarray(ivLength, ivLength + tagLength));
    const plaintext = Buffer.concat([
      decipher.update(bytes.subarray(ivLength + tagLength)),
      decipher.final(),
    ]);
    const parsed = tokenSchema.safeParse(JSON.parse(plaintext.toString('utf8')) as unknown);
    if (!parsed.success || parsed.data.expiresAt <= now) throw new ResumeCursorError();
    const cursor = parsed.data;
    if (
      cursor.executionId !== scope.data.executionId ||
      cursor.invocationId !== scope.data.invocationId ||
      cursor.generation !== scope.data.generation ||
      cursor.projectionVersion !== scope.data.projectionVersion ||
      cursor.schemaVersion !== scope.data.schemaVersion
    ) {
      throw new ResumeCursorError();
    }
    return cursor;
  } catch {
    throw new ResumeCursorError();
  }
}
