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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { Request } from 'express';
import { UserEntity } from '../user/user.entity';
import { UpdateDocumentDto } from './dto/document.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { classificationSource?: 'AI' | 'MANUAL' },
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadDocument(
      user.id,
      file,
      body.classificationSource,
    );
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
