import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChatSettings } from '@/components/workspace/personalization/chat-settings';
import { useChatPreferences } from '@/hooks/workspace/use-chat-preferences';
import {
  CHAT_PREFERENCES_STORAGE_KEY,
  chatPreferencesStore,
} from '@/services/workspace/chat-preferences-store';

function ChatSettingsPreview() {
  return <ChatSettings preferences={useChatPreferences()} />;
}

const SWITCHES = [
  'Déplier le travail pendant qu’Alfred travaille',
  'Ouvrir les réflexions pendant qu’elles s’écrivent',
  'Replier le travail une fois la réponse terminée',
  'Réflexions d’Alfred',
  'Messages intermédiaires d’Alfred',
  'Outils d’Alfred',
  'Générations sans réponse',
  'Réflexions des spécialistes',
  'Messages des spécialistes',
  'Outils des spécialistes',
] as const;

/** The switches that are on, in page order. */
const on = () =>
  SWITCHES.filter(
    (name) => screen.getByRole('switch', { name }).getAttribute('aria-checked') === 'true',
  );

beforeEach(() => {
  act(() => chatPreferencesStore.reset());
});

describe('Chat display preferences', () => {
  it('starts on the standard preset: Alfred in full, specialists without their reasoning', () => {
    render(<ChatSettingsPreview />);
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(on()).toEqual([
      'Déplier le travail pendant qu’Alfred travaille',
      'Replier le travail une fois la réponse terminée',
      'Réflexions d’Alfred',
      'Messages intermédiaires d’Alfred',
      'Outils d’Alfred',
      'Messages des spécialistes',
      'Outils des spécialistes',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('enregistrés dans ce navigateur');
  });

  it('sets the switches of the chosen preset and turns custom when a switch changes', async () => {
    const user = userEvent.setup();
    render(<ChatSettingsPreview />);
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    expect(on()).toEqual(['Replier le travail une fois la réponse terminée']);
    await user.click(screen.getByRole('radio', { name: 'Détaillé' }));
    expect(on()).toEqual([...SWITCHES]);
    // Hiding the specialists' reasoning only: Alfred's reasoning stays, the preset turns custom.
    await user.click(screen.getByRole('switch', { name: 'Réflexions des spécialistes' }));
    expect(screen.getByRole('radio', { name: 'Personnalisé' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Réflexions d’Alfred' })).toBeChecked();
    // The same combination as a preset selects it again.
    await user.click(screen.getByRole('switch', { name: 'Réflexions des spécialistes' }));
    expect(screen.getByRole('radio', { name: 'Détaillé' })).toBeChecked();
    // Choosing Personnalisé keeps the switches as they are.
    await user.click(screen.getByRole('radio', { name: 'Personnalisé' }));
    expect(screen.getByRole('radio', { name: 'Personnalisé' })).toBeChecked();
    expect(on()).toEqual([...SWITCHES]);
  });

  it('persists the choices in this browser and restores the defaults', async () => {
    const user = userEvent.setup();
    const view = render(<ChatSettingsPreview />);
    await user.click(screen.getByRole('radio', { name: 'Simple' }));
    await user.click(screen.getByRole('switch', { name: 'Outils des spécialistes' }));
    expect(JSON.parse(localStorage.getItem(CHAT_PREFERENCES_STORAGE_KEY) ?? 'null')).toMatchObject({
      version: 2,
      detail: 'custom',
      openWhileWorking: false,
      specialistTools: true,
      specialistReasoning: false,
    });
    view.unmount();
    render(<ChatSettingsPreview />);
    expect(screen.getByRole('radio', { name: 'Personnalisé' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Outils des spécialistes' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Restaurer l’affichage par défaut' }));
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(localStorage.getItem(CHAT_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('reads the earlier record and ignores unknown values', () => {
    localStorage.setItem(
      CHAT_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, detail: 'simple', showReasoning: 'non' }),
    );
    const view = render(<ChatSettingsPreview />);
    expect(screen.getByRole('radio', { name: 'Personnalisé' })).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Déplier le travail pendant qu’Alfred travaille' }),
    ).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Réflexions des spécialistes' })).toBeChecked();
    view.unmount();
    localStorage.setItem(CHAT_PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 9 }));
    render(<ChatSettingsPreview />);
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
  });
});
