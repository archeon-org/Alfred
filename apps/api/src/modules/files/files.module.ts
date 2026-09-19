import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { TenantsModule } from '../tenants/tenants.module';
import { FileFoldersController } from './api/file-folders.controller';
import { FilesController } from './api/files.controller';
import { SingleFileUploadInterceptor } from './api/single-file-upload.interceptor';
import { FileCollector } from './application/file-collector';
import { FileExtractionWorker } from './application/file-extraction.worker';
import { FileFoldersService } from './application/file-folders.service';
import { FileUploadService } from './application/file-upload.service';
import { FilesService } from './application/files.service';
import { UploadSlots } from './application/upload-slots';
import { EXTRACTION_RUNNER, type ExtractionRunner } from './domain/extraction.port';
import { FileAttachmentsModule } from './file-attachments.module';
import { FilesStorageModule } from './files-storage.module';
import { InlineExtractionRunner } from './infrastructure/extraction/inline-extraction.runner';
import { WorkerThreadExtractionRunner } from './infrastructure/extraction/worker-thread-extraction.runner';

/**
 * The personal file library: upload, catalog, folders, extraction and message attachments.
 * `FileFoldersController` comes first so that `/files/folders` is never read as `/files/:id`.
 */
@Module({
  imports: [ConfigModule, TenantsModule, FilesStorageModule, FileAttachmentsModule],
  controllers: [FileFoldersController, FilesController],
  providers: [
    {
      provide: EXTRACTION_RUNNER,
      inject: [ConfigService],
      // Tests run TypeScript sources, where no compiled worker entry exists to start a thread on.
      useFactory: (config: ConfigService): ExtractionRunner =>
        config.get<string>('NODE_ENV') === 'test'
          ? new InlineExtractionRunner()
          : new WorkerThreadExtractionRunner(),
    },
    FileCollector,
    FileExtractionWorker,
    FileUploadService,
    FilesService,
    FileFoldersService,
    UploadSlots,
    SingleFileUploadInterceptor,
  ],
})
export class FilesModule {}
