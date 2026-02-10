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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiUnprocessableEntityResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { DocumentService } from './document.service';
import { Request } from 'express';
import { UserEntity } from '@archeon-org/database';
import { UpdateDocumentDto, BulkUpdateCategoryDto } from './dto/document.dto';
import { Paginate, PaginateQuery } from 'nestjs-paginate';
import { ThrottleUpload } from '../common/decorators/throttle.decorator';

@ApiTags('documents')
@ApiBearerAuth('JWT-auth')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload/ai')
  @ThrottleUpload()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload document with AI processing',
    description:
      'Uploads a document file and triggers AI processing for automatic classification, title generation, and knowledge graph ingestion.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document file to upload',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG, PNG, or HEIC file (max 20MB)',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Document uploaded and AI processing started',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        title: { type: 'string', nullable: true },
        processingStatus: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed'],
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid file type or size exceeds 20MB',
  })
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
  @ThrottleUpload()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload document without AI processing',
    description:
      'Uploads a document file without automatic AI processing. User must manually classify and organize the document.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document file to upload',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG, PNG, or HEIC file (max 20MB)',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Document uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        title: { type: 'string', nullable: true },
        processingStatus: { type: 'string', example: 'completed' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid file type or size exceeds 20MB',
  })
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
  @ApiOperation({
    summary: 'Get all user documents',
    description:
      'Retrieves paginated list of documents belonging to the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Paginated list of documents',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              description: { type: 'string', nullable: true },
              processingStatus: { type: 'string' },
              category: {
                type: 'object',
                nullable: true,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
              tags: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            itemsPerPage: { type: 'number' },
            totalItems: { type: 'number' },
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
        links: {
          type: 'object',
          properties: {
            current: { type: 'string' },
            next: { type: 'string', nullable: true },
            previous: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getDocuments(@Req() req: Request, @Paginate() query: PaginateQuery) {
    const user = req.user as UserEntity;
    return this.documentService.getUserDocuments(user.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get document by ID',
    description:
      'Retrieves a single document with its signed URL for file access.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Document with signed URL',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
        fileUrl: { type: 'string', description: 'Signed URL for file access' },
        processingStatus: { type: 'string' },
        category: { type: 'object', nullable: true },
        tags: { type: 'array' },
        metadata: { type: 'object' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async getDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.getDocumentWithUrl(user.id, id);
  }

  @Patch('bulk-update')
  @ApiOperation({
    summary: 'Bulk update document categories',
    description: 'Updates the category for multiple documents at once.',
  })
  @ApiBody({ type: BulkUpdateCategoryDto })
  @ApiOkResponse({
    description: 'Documents updated successfully',
    schema: {
      type: 'object',
      properties: {
        updated: { type: 'number', description: 'Number of documents updated' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
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
  @ApiOperation({
    summary: 'Update document',
    description: 'Updates document metadata, category, or tags.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiOkResponse({
    description: 'Document updated successfully',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async updateDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    const user = req.user as UserEntity;
    return this.documentService.update(user.id, id, updateDocumentDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete document',
    description:
      'Permanently deletes a document and its associated files from storage.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiNoContentResponse({ description: 'Document deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async deleteDocument(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.remove(user.id, id);
  }

  @Post(':id/classify')
  @ApiOperation({
    summary: 'Trigger AI classification',
    description: 'Manually triggers AI classification for a document.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Classification task queued',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Classification task queued' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async triggerAiClassification(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerAiClassification(user.id, id);
  }

  @Post(':id/generate-title')
  @ApiOperation({
    summary: 'Trigger AI title generation',
    description: 'Manually triggers AI title generation for a document.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Title generation task queued',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Title generation task queued' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async triggerAiTitleGeneration(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerAiTitleGeneration(user.id, id);
  }

  /**
   * Trigger knowledge graph ingestion for a document.
   * Kept as /embed endpoint for backward compatibility with mobile app.
   */
  @Post(':id/embed')
  @ApiOperation({
    summary: 'Trigger knowledge graph ingestion',
    description:
      'Ingests document into the knowledge graph for semantic search. Endpoint named "embed" for backward compatibility.',
  })
  @ApiParam({
    name: 'id',
    description: 'Document UUID',
    type: 'string',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Graph ingestion task queued',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Graph ingestion task queued' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async triggerGraphIngestion(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as UserEntity;
    return this.documentService.triggerGraphIngestion(user.id, id);
  }
}
