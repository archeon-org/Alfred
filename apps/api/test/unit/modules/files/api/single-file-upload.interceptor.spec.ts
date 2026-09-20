import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';

import type { INestApplication, PipeTransform } from '@nestjs/common';
import { Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { parseEnvironment } from '@api/config/environment';
import {
  abandonedSignalOf,
  SingleFileUploadInterceptor,
} from '@api/modules/files/api/single-file-upload.interceptor';
import { FILE_SETTINGS } from '@api/modules/files/application/file-settings';
import { UploadSlots } from '@api/modules/files/application/upload-slots';

let release: (() => void) | undefined;
let reached = 0;
/** Held between the end of the multipart parsing and the handler: the window a late listener misses. */
let parsed: (() => void) | undefined;
let holdAfterParsing = false;
let abandonedAtHandler: boolean | undefined;

class HoldAfterParsing implements PipeTransform {
  async transform(value: unknown): Promise<unknown> {
    if (holdAfterParsing) {
      await new Promise<void>((resolve) => {
        parsed = resolve;
      });
    }
    return value;
  }
}

@Controller('probe')
class ProbeController {
  @Post()
  @UseInterceptors(SingleFileUploadInterceptor)
  async receive(
    @UploadedFile(new HoldAfterParsing()) file: { buffer: Buffer } | undefined,
    @Req() request: object,
  ) {
    reached += 1;
    abandonedAtHandler = abandonedSignalOf(request)?.aborted;
    if (abandonedAtHandler === true) return { bytes: 0 };
    // Holds the request open, as a slow store would, until the test lets it finish.
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { bytes: file?.buffer.byteLength ?? 0 };
  }
}

async function buildApp(settings: {
  maxFileBytes: number;
  maxConcurrentUploads: number;
  uploadBodyDeadlineMs?: number;
}) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService(
          parseEnvironment({
            AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
            DATABASE_URL: 'postgresql://test:unused@localhost/unused',
            NODE_ENV: 'test',
          }),
        ),
      },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: FILE_SETTINGS, useValue: { uploadBodyDeadlineMs: 30_000, ...settings } },
      UploadSlots,
      SingleFileUploadInterceptor,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApplication(app);
  await app.listen(0, '127.0.0.1');
  return app;
}

const form = (bytes: number): FormData => {
  const body = new FormData();
  body.set('file', new Blob([new Uint8Array(bytes)]), 'a.pdf');
  return body;
};

const BOUNDARY = 'alfred-test-boundary';
const PART_HEAD =
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n` +
  'Content-Type: application/pdf\r\n\r\n';
const PART_TAIL = `\r\n--${BOUNDARY}--\r\n`;

/** A raw request, so that a test decides when the body ends — or that it never does. */
function open(url: string): { request: ClientRequest; answered: Promise<IncomingMessage> } {
  const request = httpRequest(url, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      'transfer-encoding': 'chunked',
    },
  });
  const answered = new Promise<IncomingMessage>((resolve, reject) => {
    request.once('response', resolve);
    request.once('error', reject);
  });
  answered.catch(() => undefined);
  return { request, answered };
}

describe('upload slots', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    parsed?.();
    release?.();
    parsed = undefined;
    release = undefined;
    holdAfterParsing = false;
    abandonedAtHandler = undefined;
    reached = 0;
    await app?.close();
    app = undefined;
  });

  it('counts a slot per acquisition and frees it exactly once', () => {
    const slots = new UploadSlots({ maxConcurrentUploads: 2 } as never);
    const first = slots.acquire('ada');
    const second = slots.acquire('grace');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(slots.acquire('linus')).toBeNull();

    first?.();
    first?.();
    expect(slots.acquire('linus')).not.toBeNull();
    expect(slots.acquire('ada')).toBeNull();
  });

  it('never gives one account every slot of the instance', () => {
    const slots = new UploadSlots({ maxConcurrentUploads: 8 } as never);
    const first = slots.acquire('ada');
    expect(slots.acquire('ada')).not.toBeNull();
    // The application sends two at a time; a third from the same account is not an upload queue.
    expect(slots.acquire('ada')).toBeNull();
    expect(slots.acquire('grace')).not.toBeNull();

    first?.();
    expect(slots.acquire('ada')).not.toBeNull();
  });

  it('refuses the request beyond the last slot while its body is still arriving', async () => {
    app = await buildApp({ maxFileBytes: 1_000_000, maxConcurrentUploads: 1 });
    const url = `${await app.getUrl()}/api/probe`;

    const held = fetch(url, { method: 'POST', body: form(10) });
    await expect.poll(() => reached).toBe(1);

    // This body never ends. An interceptor that read the body before counting would never
    // answer; the refusal arriving at all proves the slot is decided before any byte is read.
    const late = open(url);
    late.request.write(PART_HEAD);
    late.request.write(Buffer.alloc(1_024));
    const refused = await late.answered;
    expect(refused.statusCode).toBe(503);
    const chunks: Buffer[] = [];
    for await (const chunk of refused) chunks.push(chunk as Buffer);
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toMatchObject({
      error: { code: 'upload_busy' },
    });
    expect(late.request.writableEnded).toBe(false);
    late.request.destroy();
    expect(reached).toBe(1);

    release?.();
    expect((await held).status).toBe(201);

    // The slot is free again once the first request is over.
    const next = fetch(url, { method: 'POST', body: form(10) });
    await expect.poll(() => reached).toBe(2);
    release?.();
    expect((await next).status).toBe(201);
  });

  it('frees the slot of a request that is refused', async () => {
    app = await buildApp({ maxFileBytes: 64, maxConcurrentUploads: 1 });
    const url = `${await app.getUrl()}/api/probe`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tooLarge = await fetch(url, { method: 'POST', body: form(200_000) });
      expect(tooLarge.status).toBe(413);
      expect(await tooLarge.json()).toMatchObject({
        error: { code: 'file_too_large', details: { maxFileBytes: 64 } },
      });
    }
    expect(reached).toBe(0);

    const accepted = fetch(url, { method: 'POST', body: form(10) });
    await expect.poll(() => reached).toBe(1);
    release?.();
    expect((await accepted).status).toBe(201);
  });

  it('knows that the client left between the end of the body and the handler', async () => {
    app = await buildApp({ maxFileBytes: 1_000_000, maxConcurrentUploads: 1 });
    const url = `${await app.getUrl()}/api/probe`;
    let serverSocketClosed = false;
    (
      app.getHttpServer() as { on(event: 'connection', listener: (socket: Socket) => void): void }
    ).on('connection', (socket) => {
      socket.once('close', () => {
        serverSocketClosed = true;
      });
    });
    holdAfterParsing = true;

    // The whole body is sent and parsed; the request now waits just before its handler.
    const upload = open(url);
    upload.request.end(
      Buffer.concat([Buffer.from(PART_HEAD), Buffer.alloc(32), Buffer.from(PART_TAIL)]),
    );
    await expect.poll(() => parsed !== undefined).toBe(true);

    // The browser leaves in that window. A `close` listener attached by the handler would be
    // attached after the event, and the file would be stored and published for nobody.
    upload.request.destroy();
    await expect.poll(() => serverSocketClosed).toBe(true);
    parsed?.();

    await expect.poll(() => reached).toBe(1);
    expect(abandonedAtHandler).toBe(true);
  });

  it('cuts a body that trickles past its deadline, and frees the slot', async () => {
    app = await buildApp({
      maxFileBytes: 1_000_000,
      maxConcurrentUploads: 1,
      uploadBodyDeadlineMs: 300,
    });
    const url = `${await app.getUrl()}/api/probe`;

    const trickle = open(url);
    const cut = new Promise<void>((resolve) => {
      trickle.request.once('close', () => {
        resolve();
      });
    });
    trickle.request.on('error', () => undefined);
    trickle.request.write(PART_HEAD);
    trickle.request.write(Buffer.alloc(16));
    await cut;
    expect(reached).toBe(0);

    const accepted = fetch(url, { method: 'POST', body: form(10) });
    await expect.poll(() => reached).toBe(1);
    release?.();
    expect((await accepted).status).toBe(201);
  });
});
