import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { FILE_SETTINGS, readFileSettings } from './application/file-settings';
import { MessageAttachmentsService } from './application/message-attachments.service';
import { FilesStorageModule } from './files-storage.module';

/**
 * What the executions module needs from the file library, and nothing more: attaching library
 * files to a message and turning them into runtime content. It carries no route, guard or
 * background worker, so importing it never pulls the upload surface into another composition.
 */
@Module({
  imports: [ConfigModule, FilesStorageModule],
  providers: [
    { provide: FILE_SETTINGS, inject: [ConfigService], useFactory: readFileSettings },
    MessageAttachmentsService,
  ],
  exports: [FILE_SETTINGS, MessageAttachmentsService],
})
export class FileAttachmentsModule {}
