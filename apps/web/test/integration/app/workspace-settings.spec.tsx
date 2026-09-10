import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppearanceSettings } from '@/components/workspace/personalization/appearance-settings';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';

function SettingsPreview() {
  const preferences = useWorkspacePreferences();
  return (
    <MemoryRouter>
      <AppearanceSettings preferences={preferences} />
    </MemoryRouter>
  );
}

describe('Workspace appearance preferences', () => {
  it('resets all appearance controls together and starts fresh after remount', async () => {
    const user = userEvent.setup();
    const view = render(<SettingsPreview />);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Taille du texte' }),
      'comfortable',
    );
    await user.click(screen.getByRole('switch', { name: 'Navigation compacte' }));
    await user.click(screen.getByRole('switch', { name: 'Réduire les animations' }));
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les préférences' }));

    expect(screen.getByRole('combobox', { name: 'Taille du texte' })).toHaveValue('standard');
    expect(screen.getByRole('switch', { name: 'Navigation compacte' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Réduire les animations' })).not.toBeChecked();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Taille du texte' }),
      'comfortable',
    );
    view.unmount();
    render(<SettingsPreview />);
    expect(screen.getByRole('combobox', { name: 'Taille du texte' })).toHaveValue('standard');
  });
});
