import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Req,
  Get,
  Param,
  Patch,
  Delete,
  Body,
  ParseFilePipeBuilder,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { UpdateDocumentDto } from './dto/document.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload/ai')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAi(
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType:
            /(pdf|jpeg|jpg|png|heic|heif|application\/pdf|application\/x-pdf|image\/jpeg|image\/png|image\/heic|image\/heif)/i,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({
          maxSize: 20 * 1024 * 1024, // 20MB
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadAi(user.id, file);
  }

  @Post('upload/manual')
  @UseInterceptors(FileInterceptor('file'))
  async uploadManual(
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType:
            /(pdf|jpeg|jpg|png|heic|heif|application\/pdf|application\/x-pdf|image\/jpeg|image\/png|image\/heic|image\/heif)/i,
          skipMagicNumbersValidation: true,
        })
        .addMaxSizeValidator({
          maxSize: 20 * 1024 * 1024, // 20MB
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadManual(user.id, file);
  }

  @Get()
  async getDocuments(@Req() req: Request, @Paginate() query: PaginateQuery) {
    const user = req.user as UserEntity;
    return this.documentService.getUserDocuments(user.id, query);
  }

  @Get(':id')
  async getDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.getDocumentWithUrl(user.id, id);
  }

  @Patch('bulk-update')
  async bulkUpdateDocuments(
    @Req() req: Request,
    @Body() body: { documentIds: string[]; categoryId: string },
  ) {
    const user = req.user as UserEntity;
    return this.documentService.bulkUpdateCategory(
      user.id,
      body.documentIds,
      body.categoryId,
    );
  }

  @Patch(':id')
  async updateDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.update(user.id, id, updateDocumentDto);
  }

  @Delete(':id')
  async deleteDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.remove(user.id, id);
  }

  @Post(':id/classify')
  async triggerAiClassification(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerAiClassification(user.id, id);
  }
}
