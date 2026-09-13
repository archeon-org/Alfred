import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeEvents } from '@/components/workspace/conversation/runtime-events';

const events = [{ id: 0, event: 'custom', data: { value: 'x'.repeat(1000) } }];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RuntimeEvents', () => {
  it.each([undefined, 'false', 'TRUE'])(
    'hides diagnostics unless explicitly enabled (%s)',
    (flag) => {
      vi.stubEnv('VITE_DEBUG_EVENTS', flag);
      render(<RuntimeEvents events={events} error={null} />);
      expect(screen.queryByText(/Événements du runtime/u)).not.toBeInTheDocument();
    },
  );

  it('renders the full payload and downloads every event as JSON', () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    const createObjectURL = vi.fn(() => 'blob:events');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(<RuntimeEvents events={events} error={null} />);
    fireEvent.click(screen.getByText(/Événements du runtime/u));
    expect(screen.getByText(/x{1000}/u)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Événements capturés' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger les événements' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0];
    expect(anchor).toBeInstanceOf(HTMLAnchorElement);
    if (anchor instanceof HTMLAnchorElement) expect(anchor.download).toMatch(/\.json$/u);
  });

  it('shows storage failures even if no event could be restored', () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    render(<RuntimeEvents events={[]} error="Stockage indisponible" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Stockage indisponible');
  });
});
