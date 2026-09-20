import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createResumeCursor,
  readResumeCursor,
  ResumeCursorError,
  type ResumeCursorScope,
} from '@api/modules/stream/api/resume-cursor';

const key = randomBytes(32).toString('hex');
const now = 1_000_000;
const scope: ResumeCursorScope = {
  executionId: 'execution-private-id',
  invocationId: 'invocation-private-id',
  generation: '877e5ec0-9fb8-4f6d-a814-bdbde1e5e1a1',
  projectionVersion: 1,
  schemaVersion: 1,
};
const payload = { ...scope, nativePosition: 'native-private-watermark', outputSubposition: 2 };

describe('encrypted resume cursor', () => {
  it('round trips the complete watermark without disclosing scope or deterministic ciphertext', () => {
    const first = createResumeCursor(payload, key, { now, ttlMs: 60_000 });
    const second = createResumeCursor(payload, key, { now, ttlMs: 60_000 });
    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1\.[A-Za-z0-9_-]+$/u);
    expect(first).not.toContain(scope.executionId);
    const decodedWire = Buffer.from(first.slice(3), 'base64url').toString('utf8');
    expect(decodedWire).not.toContain(scope.invocationId);
    expect(decodedWire).not.toContain(payload.nativePosition);
    expect(readResumeCursor(first, scope, key, { now })).toEqual({
      ...payload,
      expiresAt: now + 60_000,
    });
  });

  it('supports an initial snapshot before a native watermark exists', () => {
    const token = createResumeCursor(
      { ...scope, nativePosition: null, outputSubposition: 0 },
      key,
      { now },
    );
    expect(readResumeCursor(token, scope, key, { now }).nativePosition).toBeNull();
  });

  it.each([
    { executionId: 'foreign-execution' },
    { invocationId: 'foreign-invocation' },
    { generation: 'efe447d5-4c9f-41d5-9a0e-f5a4a27d8b70' },
    { projectionVersion: 2 },
  ])('rejects a cursor after current scope changes %j', (change) => {
    const token = createResumeCursor(payload, key, { now });
    expect(() => readResumeCursor(token, { ...scope, ...change }, key, { now })).toThrow(
      ResumeCursorError,
    );
  });

  it('expires at the exact deadline', () => {
    const token = createResumeCursor(payload, key, { now, ttlMs: 10 });
    expect(() => readResumeCursor(token, scope, key, { now: now + 9 })).not.toThrow();
    expect(() => readResumeCursor(token, scope, key, { now: now + 10 })).toThrow(ResumeCursorError);
  });

  it('rejects a modified ciphertext, nonce and authentication tag', () => {
    const token = createResumeCursor(payload, key, { now });
    const bytes = Buffer.from(token.slice(3), 'base64url');
    for (const position of [0, 12, bytes.length - 1]) {
      const modified = Buffer.from(bytes);
      modified[position] = (modified[position] ?? 0) ^ 1;
      expect(() =>
        readResumeCursor(`v1.${modified.toString('base64url')}`, scope, key, { now }),
      ).toThrow(ResumeCursorError);
    }
  });

  it.each(['', 'v2.invalid', 'v1.AA', 'v1.a=b', 'v1.hello\nthere', `v1.${'x'.repeat(8_192)}`])(
    'rejects malformed and oversized input without reflecting it',
    (token) => {
      try {
        readResumeCursor(token, scope, key, { now });
        expect.fail('Expected cursor rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(ResumeCursorError);
        expect(error).toMatchObject({
          message: 'Resume cursor is invalid or no longer available.',
        });
      }
    },
  );

  it('fails safely after key rotation without exposing crypto diagnostics or ids', () => {
    const token = createResumeCursor(payload, key, { now });
    try {
      readResumeCursor(token, scope, randomBytes(32).toString('hex'), { now });
      expect.fail('Expected cursor rejection');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid_cursor',
        message: 'Resume cursor is invalid or no longer available.',
      });
      expect(JSON.stringify(error)).not.toContain('private');
      expect(error).not.toHaveProperty('cause');
    }
  });

  it.each([
    { ...payload, generation: 'not-a-uuid' },
    { ...payload, schemaVersion: 2 },
    { ...payload, nativePosition: 'x'.repeat(1_025) },
    { ...payload, outputSubposition: -1 },
  ])('refuses invalid server payloads', (invalid) => {
    expect(() => createResumeCursor(invalid as typeof payload, key, { now })).toThrow(
      ResumeCursorError,
    );
  });

  it.each([0, -1, Infinity, 86_400_001])('rejects an invalid cursor TTL %s', (ttlMs) => {
    expect(() => createResumeCursor(payload, key, { now, ttlMs })).toThrow(ResumeCursorError);
  });

  it('requires an explicit sufficiently sized cursor secret', () => {
    expect(() => createResumeCursor(payload, 'short-key', { now })).toThrow(ResumeCursorError);
  });
});
