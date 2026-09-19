import { contentText, createAssistantReply } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import { autoTitle, describeRuntimeError } from '@api/modules/executions/domain/execution';

describe('createAssistantReply', () => {
  it('follows cumulative messages/partial content and ignores non-AI messages', () => {
    const reply = createAssistantReply();
    reply.observe('messages/partial', [{ content: 'Bon', id: 'ai-1', type: 'AIMessageChunk' }]);
    reply.observe('messages/partial', [{ content: 'Bonjour', id: 'ai-1', type: 'AIMessageChunk' }]);
    reply.observe('messages/complete', [{ content: 'Salut', id: 'human-1', type: 'human' }]);
    reply.observe('messages/metadata', { 'ai-1': {} });
    expect(reply.text).toBe('Bonjour');
  });

  it('accumulates messages-tuple deltas per message id', () => {
    const reply = createAssistantReply();
    reply.observe('messages', [{ content: 'A', id: 'ai-1', type: 'AIMessageChunk' }, {}]);
    reply.observe('messages', [{ content: 'B', id: 'ai-1', type: 'AIMessageChunk' }, {}]);
    reply.observe('messages', [{ content: '', id: 'ai-1', type: 'AIMessageChunk' }, {}]);
    expect(reply.text).toBe('AB');
  });

  it('reports the most recently touched AI message, including values snapshots', () => {
    const reply = createAssistantReply();
    reply.observe('messages/complete', [{ content: 'Première', id: 'ai-1', type: 'ai' }]);
    reply.observe('values', {
      messages: [
        { content: 'Q', id: 'h', type: 'human' },
        { content: [{ text: 'Réponse finale', type: 'text' }], id: 'ai-2', type: 'ai' },
      ],
    });
    expect(reply.text).toBe('Réponse finale');
  });

  it('ignores non-generation model calls announced by messages/metadata', () => {
    const reply = createAssistantReply();
    reply.observe('messages/metadata', {
      'guard-1': {
        metadata: {
          langgraph_node: 'PromptInjectionGuardMiddleware.before_agent',
          tags: ['guard', 'non-generation'],
        },
      },
    });
    reply.observe('messages/partial', [
      { content: '{ "flagged": false }', id: 'guard-1', type: 'AIMessageChunk' },
    ]);
    expect(reply.text).toBe('');
    reply.observe('messages/metadata', { 'ai-1': { metadata: { langgraph_node: 'model' } } });
    reply.observe('messages/partial', [{ content: 'Hi! How', id: 'ai-1', type: 'AIMessageChunk' }]);
    expect(reply.text).toBe('Hi! How');
    // A late exclusion (metadata after the text) drops the message and falls back to the answer.
    reply.observe('messages/partial', [{ content: '{ "late": 1 }', id: 'after-1', type: 'ai' }]);
    reply.observe('messages/metadata', {
      'after-1': { langgraph_node: 'TodoListMiddleware.after_model' },
    });
    expect(reply.text).toBe('Hi! How');
  });

  it('keeps messages whose metadata is unknown or ordinary', () => {
    const reply = createAssistantReply();
    reply.observe('messages/metadata', { 'ai-1': { metadata: { langgraph_node: 'agent' } } });
    reply.observe('messages/partial', [{ content: 'Réponse', id: 'ai-1', type: 'ai' }]);
    reply.observe('messages/partial', [{ content: 'Sans métadonnées', id: 'ai-2', type: 'ai' }]);
    expect(reply.text).toBe('Sans métadonnées');
    reply.observe('messages', [
      { content: 'x', id: 'tuple-1', type: 'AIMessageChunk' },
      { tags: ['non_generation'] },
    ]);
    expect(reply.text).toBe('Sans métadonnées');
  });

  it('stays empty on malformed payloads', () => {
    const reply = createAssistantReply();
    reply.observe('messages/partial', 'nope');
    reply.observe('messages', 'nope');
    reply.observe('values', null);
    reply.observe('messages/partial', [{ content: 'x', type: 'ai' }]);
    reply.observe('updates', { node: {} });
    expect(reply.text).toBe('');
  });
});

describe('contentText', () => {
  it('joins text blocks and skips other content kinds', () => {
    expect(contentText([{ text: 'a', type: 'text' }, 'b', { type: 'image_url' }, 3])).toBe('ab');
    expect(contentText({ text: 'x' })).toBe('');
  });
});

describe('execution domain helpers', () => {
  it('derives a bounded single-line automatic title', () => {
    expect(autoTitle('  Bonjour Alfred\nsuite ')).toBe('Bonjour Alfred');
    const long = 'a'.repeat(120);
    expect(autoTitle(long)).toHaveLength(80);
    expect(autoTitle(long).endsWith('…')).toBe(true);
  });

  it('bounds runtime error descriptions and hides non-error values', () => {
    expect(describeRuntimeError(new Error('SYNTHETIC_PRIVATE_TOKEN'))).toBe(
      'Runtime execution failed.',
    );
    expect(describeRuntimeError({ secret: 'no' })).toBe('Runtime execution failed.');
  });
});

it('redacts historical provider error text from the public execution DTO', async () => {
  const { toExecutionDto } = await import('@api/modules/executions/domain/execution');
  const result = toExecutionDto({
    id: 'execution',
    conversationId: 'conversation',
    status: 'failed',
    error: 'SYNTHETIC_PRIVATE_TOKEN raw upstream stack',
    createdAt: new Date(),
    startedAt: null,
    finishedAt: new Date(),
  });
  expect(result.error).toBe('The runtime could not complete this execution.');
  expect(result.errorCode).toBe('runtime_failed');
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC_PRIVATE_TOKEN');
});
