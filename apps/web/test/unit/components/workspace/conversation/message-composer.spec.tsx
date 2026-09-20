import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConversationTranscript } from '@/components/workspace/conversation/conversation-transcript';
import { MessageComposer } from '@/components/workspace/conversation/message-composer';
import { CONVERSATION_ID } from '../../../../support/workspace-api';

describe('MessageComposer', () => {
  it('accepts a draft but cannot send until the agent bridge provides a sender', async () => {
    const user = userEvent.setup();
    render(<MessageComposer />);
    const field = screen.getByLabelText('Message');
    await user.type(field, 'Brouillon{Enter}');
    expect(field).toHaveValue('Brouillon\n');
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    expect(screen.getByText(/raccordement de l’agent/u)).toBeVisible();
  });

  it('sends the trimmed message on Enter, keeps Shift+Enter as a newline and clears itself', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageComposer onSend={onSend} />);
    const field = screen.getByLabelText('Message');

    await user.type(field, 'Ligne un{Shift>}{Enter}{/Shift}ligne deux  ');
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('Ligne un\nligne deux', []);
    expect(field).toHaveValue('');
  });

  it('keeps the draft when the sender refuses the message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => false);
    render(<MessageComposer onSend={onSend} />);
    await user.type(screen.getByLabelText('Message'), 'Brouillon{Enter}');
    expect(onSend).toHaveBeenCalledWith('Brouillon', []);
    expect(screen.getByLabelText('Message')).toHaveValue('Brouillon');
  });

  it('clears the draft only once an asynchronous sender has accepted it', async () => {
    const user = userEvent.setup();
    let accept: (value: boolean) => void = () => undefined;
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          accept = resolve;
        }),
    );
    render(<MessageComposer onSend={onSend} />);
    const field = screen.getByLabelText('Message');
    await user.type(field, 'Brouillon{Enter}');
    expect(field).toHaveValue('Brouillon');
    accept(true);
    await vi.waitFor(() => expect(field).toHaveValue(''));
  });

  it('explains why sending is blocked and keeps the draft meanwhile', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageComposer onSend={onSend} blockedReason="Alfred répond ailleurs." />);
    const field = screen.getByLabelText('Message');
    // Enter is swallowed (it would send); the draft stays as typed.
    await user.type(field, 'Deux{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue('Deux');
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    expect(screen.getByText('Alfred répond ailleurs.')).toBeVisible();
  });

  it('pauses sending while the chat is being created', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    render(<MessageComposer onSend={onSend} isBusy />);
    await user.type(screen.getByLabelText('Message'), 'Un{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
  });

  it('offers a stop control instead of send while streaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<MessageComposer onSend={vi.fn(() => true)} isStreaming onStop={onStop} />);
    await user.click(screen.getByRole('button', { name: 'Arrêter la réponse' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Envoyer le message' })).not.toBeInTheDocument();
  });
});

describe('ConversationTranscript', () => {
  const executionId = '22222222-2222-4222-8222-222222222222';
  const message = {
    content: 'Salut',
    conversationId: CONVERSATION_ID,
    createdAt: '2026-09-11T09:00:00.000Z',
    executionId: null,
    id: '33333333-3333-4333-8333-333333333331',
    role: 'user' as const,
  };

  it('renders stored turns and the live answer without inline diagnostics', () => {
    render(
      <ConversationTranscript
        messages={[message]}
        sessions={[
          {
            id: 0,
            conversationId: CONVERSATION_ID,
            createdAt: '2026-09-11T09:00:01.000Z',
            turn: {
              activities: [],
              work: { steps: [], omittedSteps: 0 },
              assistantText: '**Bonjour** !',
              error: null,
              execution: null,
              status: 'streaming',
              userMessage: 'Encore',
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Salut')).toBeVisible();
    expect(screen.getByText('Encore')).toBeVisible();
    expect(screen.getByText('Bonjour')).toBeVisible();
    expect(screen.queryByText(/Événements du runtime/u)).not.toBeInTheDocument();
  });

  it('shows the thinking state, then the failure of a turn', () => {
    const { rerender } = render(
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
              error: null,
              execution: null,
              status: 'streaming',
              userMessage: 'Q',
            },
          },
        ]}
      />,
    );
    expect(screen.getByText('Alfred réfléchit…')).toBeVisible();
    rerender(
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
              error: 'boom',
              execution: null,
              status: 'error',
              userMessage: 'Q',
            },
          },
        ]}
      />,
    );
    expect(screen.queryByText('Aucune réponse.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('marks the last stored row of a failed execution with its error', () => {
    render(
      <ConversationTranscript
        messages={[
          { ...message, executionId },
          {
            ...message,
            content: 'Réponse partielle',
            executionId,
            id: '33333333-3333-4333-8333-333333333332',
            role: 'assistant',
          },
          { ...message, content: 'Autre', id: '33333333-3333-4333-8333-333333333333' },
        ]}
        sessions={[]}
        failure={{ error: 'La réponse a été interrompue avant la fin.', executionId }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('interrompue');
    expect(alert.closest('li')).toHaveTextContent('Réponse partielle');
    expect(alert.closest('li')).not.toHaveTextContent('Autre');
  });
});
