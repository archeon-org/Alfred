import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { expect, vi } from 'vitest';

import { configureApplication } from '@api/bootstrap';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { FileUploadThrottlerGuard } from '@api/common/guards/alfred-throttler.guard';
import { parseEnvironment } from '@api/config/environment';
import { FeatureFlagGuard } from '@api/modules/feature-flags/feature-flag.guard';
import { FeatureFlagsController } from '@api/modules/feature-flags/feature-flags.controller';
import { FeatureFlagsService } from '@api/modules/feature-flags/feature-flags.service';
import { FileFoldersController } from '@api/modules/files/api/file-folders.controller';
import { FilesController } from '@api/modules/files/api/files.controller';
import { SingleFileUploadInterceptor } from '@api/modules/files/api/single-file-upload.interceptor';
import { FileFoldersService } from '@api/modules/files/application/file-folders.service';
import { FILE_SETTINGS } from '@api/modules/files/application/file-settings';
import { FileUploadService } from '@api/modules/files/application/file-upload.service';
import { FilesService } from '@api/modules/files/application/files.service';
import { UploadSlots } from '@api/modules/files/application/upload-slots';
import {
  describeFeatureBothStates,
  expectFeatureRouteHidden,
} from '../../../../support/feature-flags';
import { pdfWithText } from '../../../../support/file-fixtures';

const FILE_ID = '98480af1-6fd5-41b1-9b43-97834987e6ea';
const QUOTA = { usedBytes: 10, reservedBytes: 0, limitBytes: 100, maxFileBytes: 64 };

const files = () => ({
  list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  quota: vi.fn().mockResolvedValue(QUOTA),
  content: vi.fn().mockResolvedValue({
    bytes: Buffer.from('%PDF-1.4'),
    mediaType: 'application/pdf',
    name: 'Résumé "final".pdf',
  }),
});
const uploads = () => ({ upload: vi.fn().mockResolvedValue({ file: {}, deduplicated: false }) });
const folders = () => ({ list: vi.fn().mockResolvedValue([]) });

/** The real controllers, flag guard, filter and multipart parser; the services are stubbed. */
async function buildApp(): Promise<INestApplication> {
  const config = new ConfigService(
    parseEnvironment({
      AUTH_JWT_SECRET: 'synthetic-test-signing-secret-at-least-32-characters',
      DATABASE_URL: 'postgresql://test:unused@localhost/unused',
      FEATURE_FILE_UPLOADS_ENABLED: process.env.FEATURE_FILE_UPLOADS_ENABLED,
      NODE_ENV: 'test',
    }),
  );
  const moduleRef = await Test.createTestingModule({
    // Registered in the order of `FilesModule`: folders first.
    controllers: [FileFoldersController, FilesController, FeatureFlagsController],
    providers: [
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: FeatureFlagGuard },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: FILE_SETTINGS, useValue: { maxFileBytes: 64, maxConcurrentUploads: 2 } },
      { provide: FilesService, useValue: files() },
      { provide: FileUploadService, useValue: uploads() },
      { provide: FileFoldersService, useValue: folders() },
      FeatureFlagsService,
      UploadSlots,
      SingleFileUploadInterceptor,
    ],
  })
    .overrideGuard(FileUploadThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  try {
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

const multipart = (bytes: Buffer, name: string): FormData => {
  const form = new FormData();
  form.set('uploadId', '11111111-1111-4111-8111-111111111111');
  form.set('file', new Blob([new Uint8Array(bytes)]), name);
  return form;
};

describeFeatureBothStates('fileUploads', buildApp, {
  whenEnabled: async (app) => {
    const url = `${await app.getUrl()}/api`;
    const manifest = (await (await fetch(`${url}/features`)).json()) as {
      data: { fileUploads: boolean };
    };
    expect(manifest.data.fileUploads).toBe(true);

    // Static routes are never read as a file identifier.
    expect((await fetch(`${url}/files/quota`)).status).toBe(200);
    expect(await (await fetch(`${url}/files/folders`)).json()).toEqual({
      success: true,
      data: { items: [] },
    });
    expect((await fetch(`${url}/files/not-a-uuid`)).status).toBe(404);

    const listed = await fetch(`${url}/files?search=contrat&kind=pdf&folderId=root&limit=5`);
    expect(listed.status).toBe(200);
    // No access-token guard in this focused module: only the parsed query is asserted.
    expect(app.get<ReturnType<typeof files>>(FilesService).list.mock.calls[0]?.[1]).toMatchObject({
      search: 'contrat',
      kind: 'pdf',
      folderId: 'root',
      limit: 5,
    });
    expect((await fetch(`${url}/files?kind=exe`)).status).toBe(400);
    expect((await fetch(`${url}/files?folderId=../etc`)).status).toBe(400);

    const uploaded = await fetch(`${url}/files`, {
      method: 'POST',
      body: multipart(pdfWithText('x').subarray(0, 60), 'Étude de marché.pdf'),
    });
    expect(uploaded.status).toBe(201);
    expect(
      app.get<ReturnType<typeof uploads>>(FileUploadService).upload.mock.calls[0]?.[1],
    ).toMatchObject({
      declaredName: 'Étude de marché.pdf',
      uploadId: '11111111-1111-4111-8111-111111111111',
      folderId: null,
    });

    // The multipart parser cuts a larger body off and answers with the domain code.
    const tooLarge = await fetch(`${url}/files`, {
      method: 'POST',
      body: multipart(Buffer.alloc(65), 'gros.pdf'),
    });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ error: { code: 'file_too_large' } });

    const missing = new FormData();
    missing.set('uploadId', '11111111-1111-4111-8111-111111111111');
    expect((await fetch(`${url}/files`, { method: 'POST', body: missing })).status).toBe(400);

    // Bytes are always an attachment of the detected type, never rendered from this origin.
    const download = await fetch(`${url}/files/${FILE_ID}/content`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(download.headers.get('cache-control')).toBe('private, no-store');
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
  },
  whenDisabled: async (app) => {
    const url = `${await app.getUrl()}/api`;
    const manifest = (await (await fetch(`${url}/features`)).json()) as {
      data: { fileUploads: boolean };
    };
    expect(manifest.data.fileUploads).toBe(false);

    for (const [method, path] of [
      ['GET', '/api/files'],
      ['POST', '/api/files'],
      ['GET', '/api/files/quota'],
      ['GET', '/api/files/folders'],
      ['POST', '/api/files/folders'],
      ['GET', `/api/files/${FILE_ID}`],
      ['PATCH', `/api/files/${FILE_ID}`],
      ['DELETE', `/api/files/${FILE_ID}`],
      ['GET', `/api/files/${FILE_ID}/content`],
      ['GET', `/api/files/${FILE_ID}/preview`],
    ] as const) {
      await expectFeatureRouteHidden(app, method, path);
    }
    expect(app.get<ReturnType<typeof files>>(FilesService).list).not.toHaveBeenCalled();
    expect(app.get<ReturnType<typeof uploads>>(FileUploadService).upload).not.toHaveBeenCalled();
  },
});
