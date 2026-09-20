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

  it('keeps the work log events with their owner, moment and safe fields only', () => {
    expect(
      canonicalAgUiEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'call-1',
        toolCallName: 'execute_raw',
        subagentRunId: 'task-1',
        timestamp: 1_789_557_456_418,
        rawEvent: { secret: 1 },
      }),
    ).toEqual({
      type: 'TOOL_CALL_START',
      toolCallId: 'call-1',
      toolCallName: 'execute_raw',
      subagentRunId: 'task-1',
      timestamp: 1_789_557_456_418,
    });
    expect(
      canonicalAgUiEvent({
        type: 'TOOL_CALL_RESULT',
        messageId: 'call-1:result',
        toolCallId: 'call-1',
        content: 'interrupted',
        subagentRunId: 'task-1',
        timestamp: -5,
      }),
    ).toEqual({
      type: 'TOOL_CALL_RESULT',
      messageId: 'call-1:result',
      toolCallId: 'call-1',
      content: 'interrupted',
      subagentRunId: 'task-1',
    });
    expect(
      canonicalAgUiEvent({
        type: 'SUBAGENT_STARTED',
        subagentRunId: 'task-1',
        name: 'topology_agent',
        parentToolCallId: 'task-1',
        parentMessageId: 'm',
        timestamp: 1_000,
      }),
    ).toEqual({
      type: 'SUBAGENT_STARTED',
      subagentRunId: 'task-1',
      name: 'topology_agent',
      parentToolCallId: 'task-1',
      parentMessageId: 'm',
      timestamp: 1_000,
    });
    expect(
      canonicalAgUiEvent({
        type: 'SUBAGENT_FINISHED',
        subagentRunId: 'task-1',
        outcome: { type: 'success' },
      }),
    ).toEqual({ type: 'SUBAGENT_FINISHED', subagentRunId: 'task-1', outcome: { type: 'success' } });
    expect(
      canonicalAgUiEvent({
        type: 'SUBAGENT_ERROR',
        subagentRunId: 'task-1',
        message: 'The specialist was interrupted.',
        code: 'interrupted',
      }),
    ).toEqual({
      type: 'SUBAGENT_ERROR',
      subagentRunId: 'task-1',
      message: 'The specialist was interrupted.',
      code: 'interrupted',
    });
    expect(canonicalAgUiEvent({ type: 'REASONING_START', messageId: 'r1', timestamp: 7 })).toEqual({
      type: 'REASONING_START',
      messageId: 'r1',
      timestamp: 7,
    });
    expect(canonicalAgUiEvent({ type: 'REASONING_END', messageId: 'r1' })).toEqual({
      type: 'REASONING_END',
      messageId: 'r1',
    });
  });

  it("keeps reasoning text, a specialist's messages and empty generations with their owner", () => {
    expect(
      canonicalAgUiEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        messageId: 'r1',
        delta: 'Je dois vérifier.',
        subagentRunId: 'task-1',
        timestamp: 3,
      }),
    ).toEqual({
      type: 'REASONING_MESSAGE_CONTENT',
      messageId: 'r1',
      delta: 'Je dois vérifier.',
      subagentRunId: 'task-1',
      timestamp: 3,
    });
    expect(
      canonicalAgUiEvent({ type: 'REASONING_MESSAGE_START', messageId: 'r1', role: 'reasoning' }),
    ).toEqual({ type: 'REASONING_MESSAGE_START', messageId: 'r1', role: 'reasoning' });
    expect(
      canonicalAgUiEvent({ type: 'REASONING_START', messageId: 'r1', subagentRunId: 'task-1' }),
    ).toEqual({ type: 'REASONING_START', messageId: 'r1', subagentRunId: 'task-1' });
    expect(
      canonicalAgUiEvent({
        type: 'TEXT_MESSAGE_START',
        messageId: 'n1',
        role: 'assistant',
        subagentRunId: 'task-1',
      }),
    ).toEqual({
      type: 'TEXT_MESSAGE_START',
      messageId: 'n1',
      role: 'assistant',
      subagentRunId: 'task-1',
    });
    expect(canonicalAgUiEvent({ type: 'STEP_STARTED', stepName: 'g1', timestamp: 9 })).toEqual({
      type: 'STEP_STARTED',
      stepName: 'g1',
      timestamp: 9,
    });
    expect(canonicalAgUiEvent({ type: 'STEP_FINISHED', stepName: 'g1' })).toEqual({
      type: 'STEP_FINISHED',
      stepName: 'g1',
    });
  });

  it('refuses specialist prompts, reports, nesting, foreign steps and unbounded content', () => {
    const started = { type: 'SUBAGENT_STARTED', subagentRunId: 'task-1', name: 'topology_agent' };
    expect(canonicalAgUiEvent({ ...started, description: 'PRIVATE PROMPT' })).toBeNull();
    expect(canonicalAgUiEvent({ ...started, parentSubagentRunId: 'other' })).toBeNull();
    expect(canonicalAgUiEvent({ ...started, name: 'x'.repeat(161) })).toBeNull();
    expect(
      canonicalAgUiEvent({ type: 'SUBAGENT_FINISHED', subagentRunId: 'task-1', result: 'REPORT' }),
    ).toBeNull();
    expect(
      canonicalAgUiEvent({
        type: 'SUBAGENT_FINISHED',
        subagentRunId: 'task-1',
        outcome: { type: 'suspended', interruptIds: ['i1'] },
      }),
    ).toBeNull();
    expect(
      canonicalAgUiEvent({
        type: 'REASONING_MESSAGE_CONTENT',
        messageId: 'r1',
        delta: 'x'.repeat(32_769),
      }),
    ).toBeNull();
    expect(
      canonicalAgUiEvent({ type: 'STEP_STARTED', stepName: 'g1', subagentRunId: 'task-1' }),
    ).toBeNull();
    expect(
      canonicalAgUiEvent({
        type: 'TOOL_CALL_START',
        toolCallId: 'c',
        toolCallName: 'x',
        subagentRunId: 'y'.repeat(129),
      }),
    ).toBeNull();
  });

  it('keeps the omitted step count as the one custom event of the profile', () => {
    expect(
      canonicalAgUiEvent({
        type: 'CUSTOM',
        name: 'alfred.work.omitted',
        value: { omittedSteps: 7, secret: 'private' },
        timestamp: 1_000,
      }),
    ).toEqual({
      type: 'CUSTOM',
      name: 'alfred.work.omitted',
      value: { omittedSteps: 7 },
      timestamp: 1_000,
    });
    for (const value of [{ omittedSteps: -1 }, { omittedSteps: 1.5 }, { omittedSteps: '3' }, null])
      expect(canonicalAgUiEvent({ type: 'CUSTOM', name: 'alfred.work.omitted', value })).toBeNull();
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
