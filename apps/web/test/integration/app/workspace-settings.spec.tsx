import { MemoryRouter } from 'react-router-dom';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSettings } from '@/components/workspace/personalization/appearance-settings';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';
import { useAppearanceEffects } from '@/hooks/workspace/use-appearance-effects';
import { appearanceStore, APPEARANCE_STORAGE_KEY } from '@/services/workspace/appearance-store';
import { DEFAULT_APPEARANCE, decodeAppearance } from '@/lib/workspace/appearance-preferences';

function SettingsPreview() {
  const preferences = useWorkspacePreferences();
  useAppearanceEffects();
  return (
    <MemoryRouter>
      <AppearanceSettings preferences={preferences} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  act(() => appearanceStore.reset());
});

describe('Workspace appearance preferences', () => {
  it('persists visual choices across remount and restores defaults together', async () => {
    const user = userEvent.setup();
    const view = render(<SettingsPreview />);
    await user.click(screen.getByRole('radio', { name: 'Sombre' }));
    await user.click(screen.getByRole('switch', { name: 'Navigation compacte' }));
    await user.click(screen.getByRole('switch', { name: 'Réduire les animations' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
    view.unmount();
    render(<SettingsPreview />);
    expect(screen.getByRole('radio', { name: 'Sombre' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Navigation compacte' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Restaurer l’apparence par défaut' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('switch', { name: 'Navigation compacte' })).not.toBeChecked();
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
  });

  it('shares updates between consumers and validates cross-tab updates and deletion', () => {
    const first = renderHook(useWorkspacePreferences);
    const second = renderHook(useWorkspacePreferences);
    act(() => first.result.current.setAccent('violet'));
    expect(second.result.current.accent).toBe('violet');
    act(() => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ ...DEFAULT_APPEARANCE, theme: 'dark', accent: 'invalid' }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, storageArea: localStorage }),
      );
    });
    expect(first.result.current.theme).toBe('dark');
    expect(first.result.current.accent).toBe('sage');
    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(second.result.current.theme).toBe('light');
  });

  it('follows OS changes only in system mode and removes the listener', () => {
    let changed: (() => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        changed = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', () => media);
    const view = renderHook(() => {
      useAppearanceEffects();
      return useWorkspacePreferences();
    });
    act(() => view.result.current.setTheme('system'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    act(() => {
      media.matches = false;
      changed?.();
    });
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    act(() => view.result.current.setTheme('dark'));
    expect(media.removeEventListener).toHaveBeenCalled();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    view.unmount();
    vi.unstubAllGlobals();
  });

  it('shows a persistence limitation while keeping the controls usable when storage is full', async () => {
    const user = userEvent.setup();
    render(<SettingsPreview />);
    const persist = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    await user.click(screen.getByRole('radio', { name: 'Sombre' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('status')).toHaveTextContent(
      'stockage de ce navigateur est indisponible',
    );
    persist.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Restaurer l’apparence par défaut' }));
    expect(screen.getByRole('status')).toHaveTextContent('enregistrés dans ce navigateur');
  });

  it('drops unsupported versions and unknown fields instead of accepting arbitrary state', () => {
    expect(decodeAppearance({ version: 99, theme: 'dark' })).toEqual(DEFAULT_APPEARANCE);
    expect(decodeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(
      decodeAppearance({
        ...DEFAULT_APPEARANCE,
        arbitrary: 'discard',
        density: 'huge',
        reducedMotion: 'yes',
      }),
    ).toEqual(DEFAULT_APPEARANCE);
  });
});
