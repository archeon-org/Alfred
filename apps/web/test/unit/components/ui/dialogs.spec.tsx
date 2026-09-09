import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownDocumentDialog } from '@/components/ui/markdown-document-dialog';
import { TextFieldDialog } from '@/components/ui/text-field-dialog';

describe('ConfirmDialog', () => {
  it('confirms, cancels and refuses to close while pending', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        confirmLabel="Supprimer"
        description="Irréversible."
        destructive
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        title="Supprimer ?"
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer ?' });
    expect(within(dialog).getByRole('button', { name: 'Supprimer' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <ConfirmDialog
        confirmLabel="Supprimer"
        description="Irréversible."
        error="Échec."
        isPending
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        title="Supprimer ?"
      />,
    );
    onOpenChange.mockClear();
    expect(screen.getByRole('alert')).toHaveTextContent('Échec.');
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('TextFieldDialog', () => {
  it('submits a trimmed value and disables submission when empty or unchanged', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <TextFieldDialog
        initialValue="Ancien"
        label="Nom"
        maxLength={20}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
        submitLabel="Renommer"
        title="Renommer"
      />,
    );
    const field = screen.getByRole('textbox', { name: 'Nom' });
    const submit = screen.getByRole('button', { name: 'Renommer' });
    expect(field).toHaveValue('Ancien');
    expect(submit).toBeDisabled();

    await user.clear(field);
    expect(submit).toBeDisabled();
    await user.type(field, '  Nouveau ');
    expect(submit).toBeEnabled();
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Nouveau');
  });

  it('shows the error, blocks input while pending and closes on cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <TextFieldDialog
        label="Nom"
        maxLength={20}
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        open
        submitLabel="Créer"
        title="Créer"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(
      <TextFieldDialog
        error="Nom invalide."
        isPending
        label="Nom"
        maxLength={20}
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
        open
        submitLabel="Créer"
        title="Créer"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Nom invalide.');
    expect(screen.getByRole('textbox', { name: 'Nom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled();
  });
});

describe('MarkdownDocumentDialog', () => {
  it('edits, previews, counts the limit and saves only real changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <MarkdownDocumentDialog
        limit={{ max: 12, unit: 'bytes' }}
        onOpenChange={vi.fn()}
        onSave={onSave}
        open
        title="Contexte"
        value="# Old"
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Contexte' });
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' });
    const textarea = within(dialog).getByRole('textbox', { name: 'Contexte' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText('5 / 12 octets')).toBeVisible();

    await user.clear(textarea);
    await user.type(textarea, '# Nouveau *é*');
    expect(within(dialog).getByText('14 / 12 octets')).toBeVisible();
    expect(save).toBeDisabled();
    await user.type(textarea, '{Backspace}{Backspace}{Backspace}{Backspace}');
    expect(save).toBeEnabled();

    await user.click(within(dialog).getByRole('tab', { name: 'Aperçu' }));
    expect(
      within(within(dialog).getByRole('region', { name: 'Aperçu · Contexte' })).getByRole(
        'heading',
        {
          level: 1,
          name: 'Nouveau',
        },
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('tab', { name: 'Écrire' }));
    await user.click(save);

    expect(onSave).toHaveBeenCalledExactlyOnceWith('# Nouveau');
  });
});
