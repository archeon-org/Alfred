import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { BulkUpdateCategoryDto, UpdateDocumentDto } from './dto/document.dto';

const unauthorizedDescription = 'Invalid or missing JWT token';
const notFoundDescription = 'Document not found';

const documentIdParam = {
  name: 'id',
  description: 'Document UUID',
  type: 'string',
  format: 'uuid',
};

const singleFileBodySchema = {
  type: 'object',
  required: ['file'],
  properties: {
    file: {
      type: 'string',
      format: 'binary',
      description: 'PDF, JPEG, PNG, or HEIC file (max 20MB)',
    },
  },
};

const bulkFileBodySchema = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'string',
        format: 'binary',
      },
      description: 'PDF, JPEG, PNG, or HEIC files (max 20MB per file, max 50)',
    },
  },
};

const singleUploadResponseSchema = {
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
};

const manualUploadResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    title: { type: 'string', nullable: true },
    processingStatus: { type: 'string', example: 'completed' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const bulkUploadResponseSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
    succeeded: { type: 'number' },
    failed: { type: 'number' },
    classificationSource: { type: 'string', enum: ['AI', 'MANUAL'] },
    documents: {
      type: 'array',
      items: { type: 'object' },
    },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          originalName: { type: 'string' },
          message: { type: 'string' },
          code: { type: 'string', enum: ['UPLOAD_FAILED', 'QUEUE_FAILED'] },
        },
      },
    },
  },
};

const paginatedDocumentsResponseSchema = {
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
};

const singleDocumentResponseSchema = {
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
};

function documentTaskQueuedResponse(
  description: string,
  message: string,
): MethodDecorator {
  return ApiOkResponse({
    description,
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: message },
      },
    },
  });
}

function singleUploadDocs(
  summary: string,
  description: string,
  successDescription: string,
  responseSchema: object,
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Document file to upload',
      schema: singleFileBodySchema,
    }),
    ApiCreatedResponse({
      description: successDescription,
      schema: responseSchema,
    }),
    ApiUnprocessableEntityResponse({
      description: 'Invalid file type or size exceeds 20MB',
    }),
  );
}

function bulkUploadDocs(summary: string, description: string): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      description: 'Document files to upload',
      schema: bulkFileBodySchema,
    }),
    ApiCreatedResponse({
      description: 'Bulk upload processed',
      schema: bulkUploadResponseSchema,
    }),
    ApiUnprocessableEntityResponse({
      description: 'Invalid file type/size or empty file list',
    }),
  );
}

function documentTaskDocs(
  summary: string,
  description: string,
  successDescription: string,
  successMessage: string,
): MethodDecorator {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiParam(documentIdParam),
    documentTaskQueuedResponse(successDescription, successMessage),
    ApiNotFoundResponse({ description: notFoundDescription }),
  );
}

export function ApiDocumentControllerDocs(): ClassDecorator {
  return applyDecorators(
    ApiTags('documents'),
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse({ description: unauthorizedDescription }),
  );
}

export function ApiUploadAiDocs(): MethodDecorator {
  return singleUploadDocs(
    'Upload document with AI processing',
    'Uploads a document file and triggers AI processing for classification, title generation, and chunk indexing.',
    'Document uploaded and AI processing started',
    singleUploadResponseSchema,
  );
}

export function ApiUploadManualDocs(): MethodDecorator {
  return singleUploadDocs(
    'Upload document without AI processing',
    'Uploads a document file without automatic AI processing. User must manually classify and organize the document.',
    'Document uploaded successfully',
    manualUploadResponseSchema,
  );
}

export function ApiUploadAiBulkDocs(): MethodDecorator {
  return bulkUploadDocs(
    'Bulk upload documents with AI processing',
    'Uploads multiple document files in one request and triggers AI processing for each successful file.',
  );
}

export function ApiUploadManualBulkDocs(): MethodDecorator {
  return bulkUploadDocs(
    'Bulk upload documents without AI processing',
    'Uploads multiple document files in one request without automatic AI processing.',
  );
}

export function ApiGetDocumentsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get all user documents',
      description:
        'Retrieves paginated list of documents belonging to the authenticated user.',
    }),
    ApiOkResponse({
      description: 'Paginated list of documents',
      schema: paginatedDocumentsResponseSchema,
    }),
  );
}

export function ApiGetDocumentDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Get document by ID',
      description:
        'Retrieves a single document with its signed URL for file access.',
    }),
    ApiParam(documentIdParam),
    ApiOkResponse({
      description: 'Document with signed URL',
      schema: singleDocumentResponseSchema,
    }),
    ApiNotFoundResponse({ description: notFoundDescription }),
  );
}

export function ApiBulkUpdateDocumentsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Bulk update document categories',
      description: 'Updates the category for multiple documents at once.',
    }),
    ApiBody({ type: BulkUpdateCategoryDto }),
    ApiOkResponse({
      description: 'Documents updated successfully',
      schema: {
        type: 'object',
        properties: {
          updated: {
            type: 'number',
            description: 'Number of documents updated',
          },
        },
      },
    }),
  );
}

export function ApiUpdateDocumentDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Update document',
      description: 'Updates document metadata, category, or tags.',
    }),
    ApiParam(documentIdParam),
    ApiBody({ type: UpdateDocumentDto }),
    ApiOkResponse({
      description: 'Document updated successfully',
    }),
    ApiNotFoundResponse({ description: notFoundDescription }),
  );
}

export function ApiDeleteDocumentDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete document',
      description:
        'Permanently deletes a document and its associated files from storage.',
    }),
    ApiParam(documentIdParam),
    ApiNoContentResponse({ description: 'Document deleted successfully' }),
    ApiNotFoundResponse({ description: notFoundDescription }),
  );
}

export function ApiTriggerAiClassificationDocs(): MethodDecorator {
  return documentTaskDocs(
    'Trigger AI classification',
    'Manually triggers AI classification for a document.',
    'Classification task queued',
    'Classification task queued',
  );
}

export function ApiTriggerAiTitleGenerationDocs(): MethodDecorator {
  return documentTaskDocs(
    'Trigger AI title generation',
    'Manually triggers AI title generation for a document.',
    'Title generation task queued',
    'Title generation task queued',
  );
}

export function ApiTriggerDocumentIndexingDocs(): MethodDecorator {
  return documentTaskDocs(
    'Trigger document indexing',
    'Indexes document chunks in pgvector for retrieval-augmented search.',
    'Indexing task queued',
    'Document indexing task queued',
  );
}
