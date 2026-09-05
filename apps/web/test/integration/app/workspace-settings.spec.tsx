import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WorkspaceSettings } from '@/components/workspace/header/workspace-settings';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';

function SettingsPreview() {
  const preferences = useWorkspacePreferences();
  return <WorkspaceSettings preferences={preferences} />;
}

describe('Workspace appearance preferences', () => {
  it('resets all appearance controls together and starts fresh after remount', async () => {
    const user = userEvent.setup();
    const view = render(<SettingsPreview />);
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));

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
    await user.click(screen.getByRole('button', { name: 'Paramètres' }));
    expect(screen.getByRole('combobox', { name: 'Taille du texte' })).toHaveValue('standard');
  });
});
