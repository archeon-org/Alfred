import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { QuestionController } from 'src/question/question.controller';

describe('QuestionController', () => {
  const questionService = {
    isEnabled: jest.fn(),
    ask: jest.fn(),
    quickAnswer: jest.fn(),
    stream: jest.fn(),
  };
  const controller = new QuestionController(questionService as any);
  const req = { user: { id: 'user-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects askQuestion when service is disabled', async () => {
    questionService.isEnabled.mockReturnValue(false);

    await expect(
      controller.askQuestion(req as any, { question: 'Hello' } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('validates askQuestion length', async () => {
    questionService.isEnabled.mockReturnValue(true);

    await expect(
      controller.askQuestion(req as any, { question: '  ' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.askQuestion(req as any, { question: 'ab' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.askQuestion(req as any, { question: 'a'.repeat(2001) } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns mapped askQuestion response', async () => {
    questionService.isEnabled.mockReturnValue(true);
    questionService.ask.mockResolvedValue({
      answer: 'Answer',
      citations: [{ chunkId: 'chunk-1' }],
      confidence: 'high',
      processingTimeMs: 120,
    });

    await expect(
      controller.askQuestion(
        req as any,
        {
          question: '  What is this?  ',
          conversationHistory: [{ role: 'user', content: 'Hi' }],
        } as any,
      ),
    ).resolves.toEqual({
      answer: 'Answer',
      citations: [{ chunkId: 'chunk-1' }],
      confidence: 'high',
      processingTimeMs: 120,
    });

    expect(questionService.ask).toHaveBeenCalledWith(
      'user-1',
      'What is this?',
      expect.objectContaining({
        conversationHistory: [{ role: 'user', content: 'Hi' }],
        agentMode: undefined,
        userContext: expect.objectContaining({
          user_id: 'user-1',
        }),
      }),
    );
  });

  it('maps askQuestion downstream errors to service unavailable', async () => {
    questionService.isEnabled.mockReturnValue(true);
    questionService.ask.mockRejectedValue(new Error('failed'));

    await expect(
      controller.askQuestion(req as any, { question: 'Valid question' } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('validates quickQuestion and delegates on success', async () => {
    questionService.isEnabled.mockReturnValue(true);
    questionService.quickAnswer.mockResolvedValue({
      answer: 'Quick answer',
      confidence: 'medium',
    });

    await expect(
      controller.quickQuestion(req as any, { question: '  Fast?  ' } as any),
    ).resolves.toEqual({
      answer: 'Quick answer',
      confidence: 'medium',
    });

    expect(questionService.quickAnswer).toHaveBeenCalledWith(
      'user-1',
      'Fast?',
      expect.objectContaining({
        user_id: 'user-1',
      }),
    );
  });

  it('streams question response and forwards mode', async () => {
    questionService.isEnabled.mockReturnValue(true);
    questionService.stream.mockResolvedValue({
      ok: true,
      status: 200,
      body: {},
    });

    const fakeNodeReadable = {
      on: jest.fn().mockImplementation((event, handler) => {
        if (event === 'end') {
          setTimeout(() => handler(), 0);
        }
        return fakeNodeReadable;
      }),
      pipe: jest.fn(),
    };
    const fromWebSpy = jest
      .spyOn(Readable, 'fromWeb')
      .mockReturnValue(fakeNodeReadable as any);

    const res = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    await controller.streamQuestion(
      req as any,
      {
        question: '  What changed?  ',
        conversationHistory: [{ role: 'user', content: 'Hi' }],
        agentMode: 'reasoning',
      } as any,
      res as any,
    );

    expect(questionService.stream).toHaveBeenCalledWith(
      'user-1',
      'What changed?',
      expect.objectContaining({
        conversationHistory: [{ role: 'user', content: 'Hi' }],
        agentMode: 'reasoning',
        userContext: expect.objectContaining({
          user_id: 'user-1',
        }),
      }),
      expect.any(AbortSignal),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(fromWebSpy).toHaveBeenCalled();
    fromWebSpy.mockRestore();
  });

  it('throws when stream returns failed response', async () => {
    questionService.isEnabled.mockReturnValue(true);
    questionService.stream.mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
      text: async () => 'unavailable',
    });

    await expect(
      controller.streamQuestion(
        req as any,
        { question: 'Valid question' } as any,
        { on: jest.fn(), off: jest.fn() } as any,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
