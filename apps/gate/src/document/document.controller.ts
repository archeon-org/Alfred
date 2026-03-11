import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { UpdateDocumentDto, BulkUpdateCategoryDto } from './dto/document.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ThrottleUpload } from '../common/decorators/throttle.decorator';
import {
  ApiBulkUpdateDocumentsDocs,
  ApiDeleteDocumentDocs,
  ApiDocumentControllerDocs,
  ApiGetDocumentDocs,
  ApiGetDocumentsDocs,
  ApiTriggerAiClassificationDocs,
  ApiTriggerAiTitleGenerationDocs,
  ApiTriggerDocumentIndexingDocs,
  ApiUpdateDocumentDocs,
  ApiUploadAiBulkDocs,
  ApiUploadAiDocs,
  ApiUploadManualBulkDocs,
  ApiUploadManualDocs,
} from './document.docs';

const allowedFilePattern =
  /(pdf|jpeg|jpg|png|heic|heif|application\/pdf|application\/x-pdf|image\/jpeg|image\/png|image\/heic|image\/heif)/i;
const maxFileSizeBytes = 20 * 1024 * 1024;
const maxBulkFiles = 50;

const fileValidationPipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({
    fileType: allowedFilePattern,
    skipMagicNumbersValidation: true,
  })
  .addMaxSizeValidator({
    maxSize: maxFileSizeBytes,
  })
  .build({
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });

@ApiDocumentControllerDocs()
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload/ai')
  @ThrottleUpload()
  @UseInterceptors(FileInterceptor('file'))
  @ApiUploadAiDocs()
  async uploadAi(
    @Req() req: Request,
    @UploadedFile(fileValidationPipe) file: Express.Multer.File,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadAi(user.id, file);
  }

  @Post('upload/manual')
  @ThrottleUpload()
  @UseInterceptors(FileInterceptor('file'))
  @ApiUploadManualDocs()
  async uploadManual(
    @Req() req: Request,
    @UploadedFile(fileValidationPipe) file: Express.Multer.File,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadManual(user.id, file);
  }

  @Post('upload/ai/bulk')
  @ThrottleUpload()
  @UseInterceptors(FilesInterceptor('files', maxBulkFiles))
  @ApiUploadAiBulkDocs()
  async uploadAiBulk(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    this.validateBulkFiles(files);
    const user = req.user as UserEntity;
    return this.documentService.uploadAiBulk(user.id, files);
  }

  @Post('upload/manual/bulk')
  @ThrottleUpload()
  @UseInterceptors(FilesInterceptor('files', maxBulkFiles))
  @ApiUploadManualBulkDocs()
  async uploadManualBulk(
    @Req() req: Request,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    this.validateBulkFiles(files);
    const user = req.user as UserEntity;
    return this.documentService.uploadManualBulk(user.id, files);
  }

  @Get()
  @ApiGetDocumentsDocs()
  async getDocuments(@Req() req: Request, @Paginate() query: PaginateQuery) {
    const user = req.user as UserEntity;
    return this.documentService.getUserDocuments(user.id, query);
  }

  @Get(':id')
  @ApiGetDocumentDocs()
  async getDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.getDocumentWithUrl(user.id, id);
  }

  @Patch('bulk-update')
  @ApiBulkUpdateDocumentsDocs()
  async bulkUpdateDocuments(
    @Req() req: Request,
    @Body() body: BulkUpdateCategoryDto,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.bulkUpdateCategory(
      user.id,
      body.documentIds,
      body.categoryId,
    );
  }

  @Patch(':id')
  @ApiUpdateDocumentDocs()
  async updateDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.update(user.id, id, updateDocumentDto);
  }

  @Delete(':id')
  @ApiDeleteDocumentDocs()
  async deleteDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.remove(user.id, id);
  }

  @Post(':id/classify')
  @ApiTriggerAiClassificationDocs()
  async triggerAiClassification(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerAiClassification(user.id, id);
  }

  @Post(':id/generate-title')
  @ApiTriggerAiTitleGenerationDocs()
  async triggerAiTitleGeneration(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerAiTitleGeneration(user.id, id);
  }

  @Post(':id/index')
  @ApiTriggerDocumentIndexingDocs()
  async triggerDocumentIndexing(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerDocumentIndexing(user.id, id);
  }

  private validateBulkFiles(files: Express.Multer.File[] | undefined): void {
    if (!files || files.length === 0) {
      throw new UnprocessableEntityException(
        'At least one file is required for bulk upload',
      );
    }

    if (files.length > maxBulkFiles) {
      throw new UnprocessableEntityException(
        `Bulk upload supports up to ${maxBulkFiles} files per request`,
      );
    }

    for (const file of files) {
      const filename = file?.originalname || 'file';
      const mimetype = file?.mimetype || '';
      if (!allowedFilePattern.test(`${mimetype} ${filename}`)) {
        throw new UnprocessableEntityException(
          `Invalid file type for ${filename}. Allowed: PDF, JPEG, PNG, HEIC, HEIF`,
        );
      }
      if ((file?.size || 0) > maxFileSizeBytes) {
        throw new UnprocessableEntityException(
          `File ${filename} exceeds max size of 20MB`,
        );
      }
    }
  }
}
