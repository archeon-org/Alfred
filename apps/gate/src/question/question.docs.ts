import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { ApiPrivateController } from '../common/decorators/api-controller.decorator';
import {
  AskQuestionDto,
  QuickQuestionDto,
  QuickQuestionResponseDto,
  QuestionResponseDto,
} from './dto/question.dto';

export function ApiQuestionControllerDocs(): ClassDecorator {
  return ApiPrivateController('question', 'Question Answering');
}

export function ApiAskQuestionDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Ask a question',
      description:
        'Asks a question against the user knowledge base and returns answer with citations.',
    }),
    ApiBody({ type: AskQuestionDto }),
    ApiOkResponse({
      description: 'Question answered successfully',
      type: QuestionResponseDto,
    }),
    ApiBadRequestResponse({ description: 'Question payload is invalid' }),
    ApiServiceUnavailableResponse({
      description: 'Question API is not available',
    }),
  );
}

export function ApiQuickQuestionDocs(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Ask a quick question',
      description:
        'Returns a lightweight answer and confidence without detailed citations.',
    }),
    ApiBody({ type: QuickQuestionDto }),
    ApiOkResponse({
      description: 'Quick answer generated',
      type: QuickQuestionResponseDto,
    }),
    ApiBadRequestResponse({ description: 'Question payload is invalid' }),
    ApiServiceUnavailableResponse({
      description: 'Question API is not available',
    }),
  );
}
