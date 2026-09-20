import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useContextPanel } from '@/hooks/workspace/use-context-panel';

const viewport = vi.hoisted(() => ({ desktop: false }));
vi.mock('@/hooks/workspace/use-desktop-workspace', () => ({
  useDesktopWorkspace: () => viewport.desktop,
}));

function Router({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={['/app/conversations/one']}>{children}</MemoryRouter>;
}

function setup(docked: { readonly isOpen: boolean; readonly toggle: () => void }) {
  return renderHook(() => ({ panel: useContextPanel(docked), navigate: useNavigate() }), {
    wrapper: Router,
  });
}

describe('useContextPanel', () => {
  beforeEach(() => {
    viewport.desktop = false;
  });

  it('starts the overlay sheet closed below the workspace breakpoint, whatever the preference', () => {
    const toggle = vi.fn();
    const { result } = setup({ isOpen: true, toggle });
    expect(result.current.panel).toMatchObject({ isDocked: false, isOpen: false });

    act(() => result.current.panel.toggle());
    expect(result.current.panel.isOpen).toBe(true);
    act(() => result.current.panel.close());
    expect(result.current.panel.isOpen).toBe(false);
    act(() => result.current.panel.toggle());
    act(() => result.current.panel.toggle());
    expect(result.current.panel.isOpen).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('folds the sheet when the page changes', async () => {
    const { result } = setup({ isOpen: true, toggle: vi.fn() });
    act(() => result.current.panel.toggle());
    expect(result.current.panel.isOpen).toBe(true);
    await act(() => result.current.navigate('/app/conversations/two'));
    expect(result.current.panel.isOpen).toBe(false);
  });

  it('hands the docked panel to its preference-driven state and folds the sheet on crossing back', () => {
    const toggle = vi.fn();
    const { result, rerender } = setup({ isOpen: true, toggle });
    act(() => result.current.panel.toggle());
    expect(result.current.panel.isOpen).toBe(true);

    viewport.desktop = true;
    rerender();
    expect(result.current.panel).toMatchObject({ isDocked: true, isOpen: true });
    act(() => result.current.panel.close());
    expect(toggle).toHaveBeenCalledOnce();

    viewport.desktop = false;
    rerender();
    expect(result.current.panel).toMatchObject({ isDocked: false, isOpen: false });
  });

  it('only closes a docked panel that is open', () => {
    viewport.desktop = true;
    const toggle = vi.fn();
    const { result } = setup({ isOpen: false, toggle });
    act(() => result.current.panel.close());
    expect(toggle).not.toHaveBeenCalled();
    act(() => result.current.panel.toggle());
    expect(toggle).toHaveBeenCalledOnce();
  });
});
