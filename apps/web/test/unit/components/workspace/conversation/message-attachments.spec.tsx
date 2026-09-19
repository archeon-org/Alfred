import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
import { FILE_ID, SECOND_FILE_ID } from '../../../../support/files-api';
import { CONVERSATION_ID } from '../../../../support/workspace-api';

const attachment = {
  fileId: FILE_ID,
  name: 'rapport.pdf',
  kind: 'pdf' as const,
  mediaType: 'application/pdf',
  sizeBytes: 1024,
  available: true,
  delivery: 'text' as const,
  truncated: false,
};
const row = {
  content: 'Résume ce document',
  conversationId: CONVERSATION_ID,
  createdAt: '2026-09-11T09:00:00.000Z',
  executionId: null,
  id: '33333333-3333-4333-8333-333333333331',
  role: 'user' as const,
};

describe('files under a user message', () => {
  it('names the files of a stored row, a deleted one and a truncated one included', () => {
    render(
      <ConversationTranscript
        messages={[
          {
            ...row,
            attachments: [
              attachment,
              {
                ...attachment,
                fileId: SECOND_FILE_ID,
                name: 'ancien.docx',
                kind: 'docx',
                available: false,
                delivery: 'unavailable',
              },
              {
                ...attachment,
                fileId: '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a03',
                name: 'long.pdf',
                truncated: true,
              },
            ],
          },
        ]}
        sessions={[]}
      />,
    );
    const files = within(screen.getByRole('list', { name: 'Fichiers joints au message' }));
    const [ready, deleted, truncated] = files.getAllByRole('listitem');
    expect(ready).toHaveTextContent(/^rapport\.pdf$/u);
    expect(deleted).toHaveTextContent('ancien.docxfichier supprimé');
    expect(truncated).toHaveTextContent('long.pdftronqué');
    expect(files.queryByRole('button')).toBeNull();
    expect(files.queryByRole('link')).toBeNull();
  });

  it('shows the files of the live turn while its answer streams, even without text', () => {
    render(
      <ConversationTranscript
        messages={[]}
        sessions={[
          {
            id: 0,
            conversationId: CONVERSATION_ID,
            createdAt: '2026-09-11T09:00:01.000Z',
            turn: {
              activities: [],
              work: { steps: [], omittedSteps: 0 },
              assistantText: '',
              attachments: [{ fileId: FILE_ID, kind: 'image', name: 'capture.png' }],
              error: null,
              execution: null,
              status: 'streaming',
              userMessage: '',
            },
          },
        ]}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Fichiers joints au message' })).getByText(
        'capture.png',
      ),
    ).toBeVisible();
    // No empty bubble for a message that is its files alone.
    expect(document.querySelector('.whitespace-pre-wrap')).toBeNull();
    expect(screen.getByText('Alfred réfléchit…')).toBeVisible();
  });

  it('adds nothing under a message of an older API', () => {
    render(<ConversationTranscript messages={[row]} sessions={[]} />);
    expect(screen.getByText('Résume ce document')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Fichiers joints au message' })).toBeNull();
  });
});
