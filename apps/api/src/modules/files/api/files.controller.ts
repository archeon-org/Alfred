import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  type StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiException } from '../../../common/errors/api.exception';
import { FileUploadThrottlerGuard } from '../../../common/guards/alfred-throttler.guard';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { RequiresFeature } from '../../feature-flags/requires-feature.decorator';
import { FileUploadService } from '../application/file-upload.service';
import { FILE_RESOURCE, FilesService } from '../application/files.service';
import { DOWNLOAD_HEADERS, toDownload } from './file-download';
import { FileListQueryDto, FileUpdateDto, FileUploadFieldsDto } from './file.dto';
import { DocDownloadFileContent, DocDownloadFilePreview } from './files-download.openapi';
import {
  DocDeleteFile,
  DocGetFile,
  DocGetFileQuota,
  DocListFiles,
  DocUpdateFile,
} from './files-library.openapi';
import { DocUploadFile } from './files-upload.openapi';
import { abandonedSignalOf, SingleFileUploadInterceptor } from './single-file-upload.interceptor';

const fileId = new ResourceIdPipe(FILE_RESOURCE);

interface UploadedBytes {
  readonly buffer: Buffer;
  readonly originalname: string;
}

/**
 * The personal file library (ALF-DEC-013 `/user`). Static routes are declared before `:id`, and
 * the folders controller is registered before this one, so that neither is read as a file id.
 */
@ApiTags('files')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('fileUploads')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly uploads: FileUploadService,
  ) {}

  @Get()
  @DocListFiles()
  async list(@CurrentUser() user: AuthPrincipal, @Query() query: FileListQueryDto) {
    return ok(await this.files.list(user, query));
  }

  @Post()
  @HttpCode(201)
  @DocUploadFile()
  @UseGuards(FileUploadThrottlerGuard)
  @UseInterceptors(SingleFileUploadInterceptor)
  async upload(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() file: UploadedBytes | undefined,
    @Body() fields: FileUploadFieldsDto,
    @Req() request: object,
  ) {
    if (file === undefined) {
      throw new ApiException(400, 'file_rejected', 'A file is required.');
    }
    return ok(
      await this.uploads.upload(
        user,
        {
          bytes: file.buffer,
          // Multer decodes header bytes as latin1; browsers send UTF-8 file names.
          declaredName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          uploadId: fields.uploadId.toLowerCase(),
          folderId: fields.folderId?.toLowerCase() ?? null,
        },
        // Listening since before the body was read, so no departure is missed (see interceptor).
        abandonedSignalOf(request),
      ),
    );
  }

  @Get('quota')
  @DocGetFileQuota()
  async quota(@CurrentUser() user: AuthPrincipal) {
    return ok(await this.files.quota(user));
  }

  @Get(':id')
  @DocGetFile()
  async get(@CurrentUser() user: AuthPrincipal, @Param('id', fileId) id: string) {
    return ok(await this.files.get(user, id));
  }

  @Patch(':id')
  @DocUpdateFile()
  async update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', fileId) id: string,
    @Body() body: FileUpdateDto,
  ) {
    return ok(await this.files.update(user, id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @DocDeleteFile()
  async remove(@CurrentUser() user: AuthPrincipal, @Param('id', fileId) id: string): Promise<void> {
    await this.files.remove(user, id);
  }

  @Get(':id/content')
  @DocDownloadFileContent()
  @Header('Cache-Control', DOWNLOAD_HEADERS['Cache-Control'])
  @Header('X-Content-Type-Options', DOWNLOAD_HEADERS['X-Content-Type-Options'])
  async content(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', fileId) id: string,
  ): Promise<StreamableFile> {
    return toDownload(await this.files.content(user, id));
  }

  @Get(':id/preview')
  @DocDownloadFilePreview()
  @Header('Cache-Control', DOWNLOAD_HEADERS['Cache-Control'])
  @Header('X-Content-Type-Options', DOWNLOAD_HEADERS['X-Content-Type-Options'])
  async preview(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', fileId) id: string,
  ): Promise<StreamableFile> {
    return toDownload(await this.files.preview(user, id));
  }
}
