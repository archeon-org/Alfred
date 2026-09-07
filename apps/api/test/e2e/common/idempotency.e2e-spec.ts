import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { IdempotencyInterceptor } from '@api/common/idempotency/idempotency.interceptor';
import { IdempotencyStore, type StoredResponse } from '@api/common/idempotency/idempotency.store';
import {
  FixtureWriter,
  IdempotencyFixtureController,
  fixtureUrl,
} from '../../support/idempotency-fixture';

// HTTP wiring and guard/pipes behavior; real SQL concurrency is tested separately with PostgreSQL.
describe('idempotent fixture HTTP boundary', () => {
  let app: INestApplication;
  let url: string;
  let token: string;
  let otherToken: string;
  const records = new Map<string, StoredResponse>();
  const write = vi.fn((name: string) => Promise.resolve({ id: 1, name }));
  const store = {
    reserve(owner: string, key: string, requestHash: string) {
      const identity = `${owner}/${key}`;
      if (records.has(identity)) return Promise.resolve(false);
      records.set(identity, { requestHash, responseStatus: null, responseBody: null });
      return Promise.resolve(true);
    },
    find(owner: string, key: string) {
      return Promise.resolve(records.get(`${owner}/${key}`) ?? null);
    },
    complete(
      owner: string,
      key: string,
      requestHash: string,
      responseStatus: number,
      responseBody: unknown,
    ) {
      records.set(`${owner}/${key}`, { requestHash, responseStatus, responseBody });
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-only-idempotency-fixture-secret' })],
      controllers: [IdempotencyFixtureController],
      providers: [
        { provide: FixtureWriter, useValue: { write } },
        { provide: IdempotencyStore, useValue: store },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: 'owner-a',
      sid: 'session',
      typ: 'access',
      role: 'user',
      email: 'a@example.test',
    });
    otherToken = jwt.sign({
      sub: 'owner-b',
      sid: 'session',
      typ: 'access',
      role: 'user',
      email: 'b@example.test',
    });
    url = await fixtureUrl(app);
  });
  beforeEach(() => {
    records.clear();
    write.mockReset().mockImplementation((name) => Promise.resolve({ id: 1, name }));
  });
  afterAll(async () => {
    await app?.close();
  });

  const post = (
    key: string | undefined = 'key',
    name = 'fixture',
    bearer: string | undefined = token,
    path = '',
  ) =>
    fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key === undefined ? {} : { 'idempotency-key': key }),
        ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify({ name }),
    });

  it('replays three requests with one execution and identical status/body', async () => {
    const responses = [await post(), await post(), await post()];
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    expect(await Promise.all(responses.map((r) => r.json()))).toEqual(
      Array.from({ length: 3 }, () => ({ id: 1, name: 'fixture' })),
    );
    expect(write).toHaveBeenCalledOnce();
  });

  it('returns the shared API mismatch code and isolates owners', async () => {
    await post();
    const mismatch = await post('key', 'changed');
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({
      success: false,
      error: { code: 'idempotency_mismatch' },
    });
    expect((await post('key', 'changed', otherToken)).status).toBe(201);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('revalidates authentication before replay and validates DTOs before writes', async () => {
    await post();
    const unauthorized = await fetch(url, {
      method: 'POST',
      headers: { 'idempotency-key': 'key' },
    });
    expect(unauthorized.status).toBe(401);
    const invalid = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'invalid',
      },
      body: JSON.stringify({ unexpected: true }),
    });
    expect(invalid.status).toBe(400);
    expect(write).toHaveBeenCalledOnce();
  });

  it('bypasses undecorated routes and requests without a key', async () => {
    await post('key', 'fixture', token, '/plain');
    await post('key', 'fixture', token, '/plain');
    for (let index = 0; index < 2; index += 1)
      await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'fixture' }),
      });
    expect(write).toHaveBeenCalledTimes(4);
    expect(records.size).toBe(0);
  });

  it('serializes simultaneous HTTP retries', async () => {
    write.mockImplementation(async (name) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { id: 1, name };
    });
    const responses = await Promise.all([post(), post(), post()]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    expect(write).toHaveBeenCalledOnce();
  });

  it('replays 204 without a body and never replays handler headers', async () => {
    const first = await post('empty', 'fixture', token, '/empty');
    const second = await post('empty', 'fixture', token, '/empty');
    expect([first.status, second.status]).toEqual([204, 204]);
    expect(await second.text()).toBe('');
    const original = await post('header', 'fixture', token, '/header');
    const replay = await post('header', 'fixture', token, '/header');
    expect(original.headers.get('x-fixture-header')).toBe('original-only');
    expect(replay.headers.get('x-fixture-header')).toBeNull();
  });
});
