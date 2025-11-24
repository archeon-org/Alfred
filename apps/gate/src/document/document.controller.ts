import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  Get,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { UserEntity } from '../user/user.entity';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.uploadDocument(user.id, file);
  }

  @Get()
  async getDocuments(@Req() req: Request) {
    const user = req.user as UserEntity;
    return this.documentService.getUserDocuments(user.id);
  }

  @Get(':id')
  async getDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.getDocumentWithUrl(user.id, id);
  }
}
