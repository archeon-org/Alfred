import { EXECUTION_OUTPUT_MAX_LENGTH } from '@alfred/contracts';
import { describe, expect, it } from 'vitest';

import { canonicalAgUiEvent } from '@/lib/workspace/ag-ui-events';
import { EXECUTION_ID, snapshot } from '../../../support/executions-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

const state = (base = snapshot()) => ({
  type: 'STATE_SNAPSHOT',
  snapshot: {
    execution: base.execution,
    conversation: base.conversation,
    userMessage: base.userMessage,
  },
});

describe('AG-UI event canonicalization', () => {
  it('keeps the contract events with their known fields only', () => {
    expect(
      canonicalAgUiEvent({
        type: 'RUN_STARTED',
        threadId: CONVERSATION_ID,
        runId: EXECUTION_ID,
        rawEvent: { secret: 'private' },
        privateToken: 'private',
      }),
    ).toEqual({ type: 'RUN_STARTED', threadId: CONVERSATION_ID, runId: EXECUTION_ID });
    expect(
      canonicalAgUiEvent(
        { ...state(), privateToken: 'private' },
        { conversationId: CONVERSATION_ID },
      ),
    ).toEqual(state());
    expect(
      canonicalAgUiEvent({
        type: 'TOOL_CALL_RESULT',
        messageId: 'tool-1:result',
        toolCallId: 'tool-1',
        content: 'completed',
        role: 'tool',
      }),
    ).toEqual({
      type: 'TOOL_CALL_RESULT',
      messageId: 'tool-1:result',
      toolCallId: 'tool-1',
      content: 'completed',
      role: 'tool',
    });
  });

  it('keeps only a success outcome on the terminal event and refuses interrupt outcomes', () => {
    const finished = { type: 'RUN_FINISHED', threadId: CONVERSATION_ID, runId: EXECUTION_ID };
    expect(canonicalAgUiEvent(finished)).toEqual(finished);
    expect(canonicalAgUiEvent({ ...finished, outcome: { type: 'success' }, result: 1 })).toEqual({
      ...finished,
      outcome: { type: 'success' },
    });
    expect(
      canonicalAgUiEvent({
        ...finished,
        outcome: {
          type: 'interrupt',
          interrupts: [{ id: 'i1', value: { secret: 'private' }, metadata: { x: 1 } }],
        },
      }),
    ).toBeNull();
  });

  it('accepts assistant messages only', () => {
    expect(
      canonicalAgUiEvent({ type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' }),
    ).toEqual({ type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' });
    for (const role of ['user', 'system', 'developer']) {
      expect(canonicalAgUiEvent({ type: 'TEXT_MESSAGE_START', messageId: 'm', role })).toBeNull();
    }
  });

  it('refuses tool arguments and tool results outside the status vocabulary', () => {
    expect(
      canonicalAgUiEvent({ type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"secret":1}' }),
    ).toBeNull();
    expect(
      canonicalAgUiEvent({
        type: 'TOOL_CALL_RESULT',
        messageId: 'tool-1:result',
        toolCallId: 'tool-1',
        content: 'raw tool body',
      }),
    ).toBeNull();
  });

  it('refuses a text delta longer than the bounded answer', () => {
    const delta = (length: number) =>
      canonicalAgUiEvent({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm',
        delta: 'x'.repeat(length),
      });
    expect(delta(EXECUTION_OUTPUT_MAX_LENGTH)).not.toBeNull();
    expect(delta(EXECUTION_OUTPUT_MAX_LENGTH + 1)).toBeNull();
  });

  it('refuses events outside the contract, malformed payloads and foreign identities', () => {
    expect(
      canonicalAgUiEvent({ type: 'CUSTOM', name: 'PredictState', value: { secret: 1 } }),
    ).toBeNull();
    expect(canonicalAgUiEvent({ type: 'RAW', event: { secret: 1 } })).toBeNull();
    expect(canonicalAgUiEvent({ nope: true })).toBeNull();
    const foreign = '11111111-1111-4111-8111-111111111111';
    expect(
      canonicalAgUiEvent(
        { type: 'RUN_STARTED', threadId: CONVERSATION_ID, runId: foreign },
        { executionId: EXECUTION_ID },
      ),
    ).toBeNull();
    expect(canonicalAgUiEvent(state(), { conversationId: foreign })).toBeNull();
    expect(
      canonicalAgUiEvent(
        state(snapshot({ execution: { ...snapshot().execution, conversationId: foreign } })),
      ),
    ).toBeNull();
  });
});
