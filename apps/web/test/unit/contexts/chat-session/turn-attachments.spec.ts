import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatSessionAction } from '@/contexts/chat-session/chat-session-state';
import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import { createExecutionObserver } from '@/contexts/chat-session/execution-observer';
import { namedAttachments } from '@/contexts/chat-session/turn-attachments';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import type { AttachmentView } from '@/lib/files/composer-attachments';
import {
  createExecution,
  listMessages,
  observeExecution,
} from '@/services/executions/executions.service';
import { synthesizeFrames } from '../../../support/ag-ui-synth';
import { execution, snapshot } from '../../../support/executions-api';
import { FILE_ID } from '../../../support/files-api';
import { CONVERSATION_ID } from '../../../support/workspace-api';

vi.mock('@/services/executions/executions.service');

const picked: AttachmentView = { fileId: FILE_ID, kind: 'pdf', name: 'rapport.pdf' };
const stored = {
  ...picked,
  available: true,
  delivery: 'text' as const,
  mediaType: 'application/pdf',
  sizeBytes: 2048,
  truncated: true,
};

function launch(attachments?: readonly AttachmentView[]) {
  const turns: LiveTurn[] = [];
  const started: LiveTurn[] = [];
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const observer = createExecutionObserver({
    client: { request: vi.fn() },
    conversationId: CONVERSATION_ID,
    controller: new AbortController(),
    dispatch: (action: ChatSessionAction) => {
      if (action.type === 'start') started.push(action.session.turn);
      if (action.type === 'update') turns.push(action.turn);
    },
    id: 1,
    onClose: vi.fn(),
    queryClient,
    text: 'Résume',
    userId: 'user-1',
    ...(attachments === undefined ? {} : { attachments }),
  });
  observer.start();
  return { invalidate, started, turns };
}

beforeEach(() => {
  vi.mocked(listMessages).mockResolvedValue([]);
  const done = snapshot({
    execution: execution('completed'),
    assistantText: 'Voici.',
    revision: 1,
  });
  vi.mocked(observeExecution).mockImplementation(async function* () {
    await Promise.resolve();
    yield* synthesizeFrames(null, done);
  });
});

describe('files of a user turn', () => {
  it('names them at once, sends their ids and then trusts the API account', async () => {
    vi.mocked(createExecution).mockResolvedValue(snapshot({ attachments: [stored] }));
    const view = launch([picked]);
    expect(view.started[0]?.attachments).toEqual([picked]);
    await waitFor(() => expect(view.turns.at(-1)?.status).toBe('done'));
    expect(createExecution).toHaveBeenCalledWith(
      expect.anything(),
      CONVERSATION_ID,
      'Résume',
      expect.any(String),
      expect.any(AbortSignal),
      [FILE_ID],
    );
    expect(view.turns.at(-1)?.attachments).toEqual([stored]);
    // The files now count one more message: the library lists are read again.
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: fileKeys.lists('user-1') });
  });

  it('keeps the composer names when an older API says nothing about files', async () => {
    vi.mocked(createExecution).mockResolvedValue(snapshot());
    const view = launch([picked]);
    await waitFor(() => expect(view.turns.at(-1)?.status).toBe('done'));
    expect(view.turns.at(-1)?.attachments).toEqual([picked]);
  });

  it('leaves a message without files untouched', async () => {
    vi.mocked(createExecution).mockResolvedValue(snapshot());
    const view = launch();
    await waitFor(() => expect(view.turns.at(-1)?.status).toBe('done'));
    expect(view.started[0]).not.toHaveProperty('attachments');
    expect(vi.mocked(createExecution).mock.calls[0]?.[5]).toEqual([]);
    expect(view.invalidate).not.toHaveBeenCalledWith({ queryKey: fileKeys.lists('user-1') });
  });

  it('builds a turn patch only when the source speaks of files', () => {
    expect(namedAttachments({})).toEqual({});
    expect(namedAttachments({ attachments: [] })).toEqual({ attachments: [] });
  });
});
