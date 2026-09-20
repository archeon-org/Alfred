import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { ContextSheet } from '@/components/workspace/context/context-sheet';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-expanded={open} onClick={() => setOpen(true)}>
        Afficher le contexte
      </Button>
      <ContextSheet open={open} onClose={() => setOpen(false)}>
        <aside aria-label="Contexte de la conversation">
          <Button onClick={() => setOpen(false)}>Masquer le contexte</Button>
          <Button>Équipes</Button>
        </aside>
      </ContextSheet>
    </>
  );
}

/** The layout swaps the gutter opener for the bar opener when the window crosses md. */
function SwappingOpeners({ narrow }: { readonly narrow: boolean }) {
  const [open, setOpen] = useState(false);
  const show = () => setOpen(true);
  return (
    <>
      {narrow ? (
        <Button key="bar" data-context-opener="" onClick={show}>
          Afficher le contexte (barre)
        </Button>
      ) : (
        <Button key="gutter" data-context-opener="" onClick={show}>
          Afficher le contexte (gouttière)
        </Button>
      )}
      <Button onClick={show}>Autre déclencheur</Button>
      <ContextSheet open={open} onClose={() => setOpen(false)}>
        <aside aria-label="Contexte de la conversation">
          <Button onClick={() => setOpen(false)}>Masquer le contexte</Button>
        </aside>
      </ContextSheet>
    </>
  );
}

describe('ContextSheet', () => {
  it('stays out of the page until opened, then traps focus and gives it back on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const opener = screen.getByRole('button', { name: 'Afficher le contexte' });

    await user.click(opener);
    const sheet = screen.getByRole('dialog', { name: 'Contexte de la conversation' });
    const close = within(sheet).getByRole('button', { name: 'Masquer le contexte' });
    expect(close).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes from its own button and returns focus to the opener', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Afficher le contexte' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Masquer le contexte' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('gives focus to the opener on screen when the one that opened it was swapped out', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SwappingOpeners narrow={false} />);
    await user.click(screen.getByRole('button', { name: 'Afficher le contexte (gouttière)' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<SwappingOpeners narrow />);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher le contexte (barre)' })).toHaveFocus();
  });

  it('leaves focus with any other control that opened it', async () => {
    const user = userEvent.setup();
    render(<SwappingOpeners narrow={false} />);
    const other = screen.getByRole('button', { name: 'Autre déclencheur' });
    await user.click(other);
    await user.keyboard('{Escape}');
    expect(other).toHaveFocus();
  });
});
