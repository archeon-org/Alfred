import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import {
  ChatRequestDto,
  ExcludeDocumentDto,
  QuestionRequestDto,
} from './dto/search.dto';

export function ApiSearchControllerDocs(): ClassDecorator {
  return ApiPrivateController('search', 'Intelligent Search & RAG');
}

export function ApiSearchDocumentsDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Search documents',
      description:
        'Search user documents using semantic, hybrid, or keyword chunk retrieval modes.',
    }),
    ApiQuery({
      name: 'q',
      description: 'Search query (min 2 characters)',
      required: true,
      example: 'electricity bill from january',
    }),
    ApiQuery({
      name: 'limit',
      description: 'Maximum number of results (1-50)',
      required: false,
      example: '10',
    }),
    ApiQuery({
      name: 'mode',
      description: 'Search mode',
      required: false,
      enum: ['semantic', 'hybrid', 'keyword'],
      example: 'hybrid',
    }),
    ApiOkResponse({
      description: 'Search results',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          mode: { type: 'string' },
          count: { type: 'number' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                filename: { type: 'string' },
                originalName: { type: 'string' },
                title: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                thumbnailPath: { type: 'string', nullable: true },
                categoryId: { type: 'string', nullable: true },
                similarity: { type: 'number', minimum: 0, maximum: 1 },
                bestSnippet: { type: 'string', nullable: true },
                citations: { type: 'array', items: { type: 'object' } },
                matchReason: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid search query' }),
  );
}

export function ApiChatSearchDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Chat-based document search',
      description:
        'Send a conversational message to search documents using pgvector RAG.',
    }),
    ApiBody({
      description:
        'Chat request with message and optional conversation history',
      type: ChatRequestDto,
    }),
    ApiOkResponse({
      description: 'Chat response with search results and context',
      schema: {
        type: 'object',
        properties: {
          response: {
            type: 'object',
            properties: {
              role: { type: 'string', example: 'assistant' },
              content: { type: 'string' },
              citations: { type: 'array', items: { type: 'object' } },
            },
          },
          context: { type: 'object' },
          searchLimitInfo: {
            type: 'object',
            properties: {
              remainingSearches: { type: 'number' },
              bonusSearches: { type: 'number' },
              resetsAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    }),
    ApiForbiddenResponse({ description: 'Daily AI search limit reached' }),
    ApiBadRequestResponse({ description: 'Message is required' }),
  );
}

export function ApiExcludeDocumentDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Exclude document from chat results',
      description:
        'Mark a document to be excluded from current chat search session.',
    }),
    ApiBody({
      description: 'Document ID and current context',
      type: ExcludeDocumentDto,
    }),
    ApiOkResponse({
      description: 'Updated context with excluded document',
      schema: {
        type: 'object',
        properties: {
          context: { type: 'object' },
        },
      },
    }),
    ApiBadRequestResponse({
      description: 'Document ID or context is required',
    }),
  );
}

export function ApiQuestionSearchDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Ask Second Brain question',
      description:
        'Backward-compatible question endpoint. Proxies question requests to Scribe API.',
    }),
    ApiBody({
      description: 'Question request',
      type: QuestionRequestDto,
    }),
    ApiOkResponse({
      description: 'Question answered successfully',
      schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          citations: { type: 'array', items: { type: 'object' } },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          processingTimeMs: { type: 'number' },
        },
      },
    }),
    ApiBadRequestResponse({ description: 'Invalid question' }),
    ApiForbiddenResponse({ description: 'Daily AI search limit reached' }),
  );
}
