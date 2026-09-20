import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TurnActions } from '@/components/workspace/conversation/turn-actions';

const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const events = [
  {
    id: 1,
    executionId: EXECUTION_ID,
    event: 'RUN_STARTED',
    data: { type: 'RUN_STARTED', threadId: 'c', runId: EXECUTION_ID },
  },
  {
    id: 2,
    executionId: EXECUTION_ID,
    event: 'TEXT_MESSAGE_CONTENT',
    data: { type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: 'x'.repeat(1000) },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TurnActions', () => {
  it('copies the answer source and announces the result', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<TurnActions content="**Bonjour**" executionId={null} events={[]} />);
    expect(screen.queryByRole('button', { name: /Événements du runtime/u })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Copier la réponse' }));
    expect(writeText).toHaveBeenCalledWith('**Bonjour**');
    expect(screen.getByRole('status')).toHaveTextContent('Réponse copiée.');
    expect(screen.getByRole('button', { name: 'Copié' })).toBeVisible();
  });

  it('reports a copy failure without throwing', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<TurnActions content="texte" executionId={null} events={[]} />);
    await user.click(screen.getByRole('button', { name: 'Copier la réponse' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copie impossible.');
  });

  it('opens the events of this answer in a dialog and downloads them as JSON', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:events');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<TurnActions content="texte" executionId={EXECUTION_ID} events={events} />);
    await user.click(screen.getByRole('button', { name: 'Événements du runtime (2)' }));
    const dialog = screen.getByRole('dialog', { name: 'Événements du runtime' });
    expect(dialog).toHaveTextContent('2 événements publics de cette réponse');
    expect(dialog).toHaveTextContent(EXECUTION_ID);
    const region = within(dialog).getByRole('region', { name: 'Événements capturés' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
    expect(within(region).getByText('TEXT_MESSAGE_CONTENT')).toBeVisible();
    expect(within(region).getByText(/x{1000}/u)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Télécharger le JSON' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0];
    if (anchor instanceof HTMLAnchorElement) {
      expect(anchor.download).toBe(`alfred-events-${EXECUTION_ID}.json`);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
