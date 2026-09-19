import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ShortcutSettings } from '@/components/workspace/personalization/shortcut-settings';
import { useShortcutPreferences } from '@/hooks/workspace/use-shortcut-preferences';
import { useWorkspaceShortcuts } from '@/hooks/workspace/use-workspace-shortcuts';
import { SHORTCUT_STORAGE_KEY, shortcutStore } from '@/services/workspace/shortcut-store';

function ShortcutsPreview({ onToggleContext }: { readonly onToggleContext?: () => void }) {
  const preferences = useShortcutPreferences();
  useWorkspaceShortcuts({ toggleContext: onToggleContext ?? (() => undefined) });
  return <ShortcutSettings preferences={preferences} />;
}

const rowOf = (label: string) => {
  const item = screen.getByText(label).closest('li');
  if (item === null) throw new Error(`Missing row ${label}`);
  return within(item);
};

beforeEach(() => {
  act(() => shortcutStore.reset());
});

describe('Keyboard shortcut settings', () => {
  it('records a personal binding, applies it at once and persists it in this browser', async () => {
    const user = userEvent.setup();
    const toggles: number[] = [];
    const view = render(<ShortcutsPreview onToggleContext={() => toggles.push(1)} />);
    const context = rowOf('Afficher ou masquer le contexte');
    expect(context.getByRole('button', { name: 'Modifier' })).toBeVisible();
    expect(context.getByText('Ctrl+Maj+.')).toBeVisible();

    await user.click(context.getByRole('button', { name: 'Modifier' }));
    expect(context.getByRole('button', { name: 'Appuyez sur la combinaison…' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Modifiers alone keep the recorder waiting; the real key completes the binding.
    await user.keyboard('{Control>}{Shift>}');
    expect(context.getByRole('button', { name: 'Appuyez sur la combinaison…' })).toBeVisible();
    await user.keyboard('[Semicolon]{/Shift}{/Control}');
    expect(context.getByRole('button', { name: 'Modifier' })).toBeVisible();
    expect(context.getByText('Ctrl+Maj+;')).toBeVisible();
    expect(
      context.getByRole('button', {
        name: 'Rétablir le raccourci par défaut de « Afficher ou masquer le contexte »',
      }),
    ).toBeVisible();

    // The old chord is free and the new one drives the action.
    await user.keyboard('{Control>}{Shift>}[Period]{/Shift}{/Control}');
    expect(toggles).toHaveLength(0);
    await user.keyboard('{Control>}{Shift>}[Semicolon]{/Shift}{/Control}');
    expect(toggles).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? 'null') as unknown;
    expect(stored).toEqual({
      version: 1,
      bindings: { toggleContext: { code: 'Semicolon', shift: true, label: ';' } },
    });
    view.unmount();
    render(<ShortcutsPreview />);
    expect(rowOf('Afficher ou masquer le contexte').getByText('Ctrl+Maj+;')).toBeVisible();
  });

  it('refuses browser-reserved keys and keys another action holds, and lets Escape cancel', async () => {
    const user = userEvent.setup();
    render(<ShortcutsPreview />);
    const context = rowOf('Afficher ou masquer le contexte');
    await user.click(context.getByRole('button', { name: 'Modifier' }));
    await user.keyboard('{Control>}[KeyT]{/Control}');
    expect(context.getByRole('alert')).toHaveTextContent(
      'Réservé par le navigateur ou le système : nouvel onglet.',
    );
    await user.keyboard('{Control>}{Shift>}[Comma]{/Shift}{/Control}');
    expect(context.getByRole('alert')).toHaveTextContent(
      'Déjà utilisé par « Afficher ou masquer la navigation ».',
    );
    await user.keyboard('[Semicolon]');
    expect(context.getByRole('alert')).toHaveTextContent('Le raccourci doit commencer par Ctrl.');
    // Still recording: nothing was saved and the current key is unchanged.
    expect(context.getByRole('button', { name: 'Appuyez sur la combinaison…' })).toBeVisible();
    expect(context.getByText('Ctrl+Maj+.')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(context.getByRole('button', { name: 'Modifier' })).toBeVisible();
    expect(context.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBeNull();
  });

  it('restores one binding or all of them to the defaults', async () => {
    const user = userEvent.setup();
    render(<ShortcutsPreview />);
    const restoreAll = screen.getByRole('button', { name: 'Restaurer les raccourcis par défaut' });
    expect(restoreAll).toBeDisabled();

    const context = rowOf('Afficher ou masquer le contexte');
    await user.click(context.getByRole('button', { name: 'Modifier' }));
    await user.keyboard('{Control>}[Semicolon]{/Control}');
    const navigation = rowOf('Afficher ou masquer la navigation');
    await user.click(navigation.getByRole('button', { name: 'Modifier' }));
    await user.keyboard('{Control>}[Quote]{/Control}');
    expect(context.getByText('Ctrl+;')).toBeVisible();
    expect(navigation.getByText('Ctrl+’')).toBeVisible();
    expect(restoreAll).toBeEnabled();

    await user.click(
      context.getByRole('button', {
        name: 'Rétablir le raccourci par défaut de « Afficher ou masquer le contexte »',
      }),
    );
    expect(context.getByText('Ctrl+Maj+.')).toBeVisible();
    expect(navigation.getByText('Ctrl+’')).toBeVisible();

    await user.click(restoreAll);
    expect(navigation.getByText('Ctrl+Maj+,')).toBeVisible();
    expect(restoreAll).toBeDisabled();
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBeNull();
  });
});
