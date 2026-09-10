import type { SkillWriteInput } from '@alfred/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SkillEditor } from '@/components/workspace/skills/skill-editor';

describe('Skill editor', () => {
  it('creates a Markdown skill from named instructions', async () => {
    const user = userEvent.setup();
    const save = vi.fn<(input: SkillWriteInput) => Promise<void>>().mockResolvedValue(undefined);
    render(<SkillEditor onSave={save} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Nom du skill' }), 'synthese');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Résumer un document');
    await user.type(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }), '# Synthèse');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'synthese',
        description: 'Résumer un document',
        files: [expect.objectContaining({ path: 'SKILL.md' })],
      }),
    );
  });

  it('retains the draft when saving fails and confirms before discarding', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <SkillEditor onSave={vi.fn().mockRejectedValue(new Error('Unavailable'))} onClose={close} />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Nom du skill' }), 'synthese');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Résumer');
    await user.type(
      screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }),
      '# Mon brouillon',
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' })).toHaveValue(
      '# Mon brouillon',
    );
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('Skill package editing', () => {
  it('adds, edits, previews and removes a nested file before saving', async () => {
    const user = userEvent.setup();
    const save = vi.fn<(input: SkillWriteInput) => Promise<void>>().mockResolvedValue(undefined);
    render(<SkillEditor onSave={save} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Nom du skill' }), 'synthese');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Résumer');
    const path = screen.getByRole('textbox', { name: 'Chemin du nouveau fichier' });
    await user.clear(path);
    await user.type(path, 'scripts/analyse.py');
    await user.click(screen.getByRole('button', { name: 'Créer un fichier vide' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Contenu de scripts/analyse.py' }),
      'print(1)',
    );
    await user.click(screen.getByRole('button', { name: 'SKILL.md' }));
    await user.type(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }), '# Résultat');
    await user.click(screen.getByRole('tab', { name: 'Aperçu' }));
    expect(screen.getByRole('heading', { name: 'Résultat' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'scripts/analyse.py' }));
    expect(screen.getByRole('textbox', { name: 'Contenu de scripts/analyse.py' })).toHaveValue(
      'print(1)',
    );
    await user.click(screen.getByRole('button', { name: 'Retirer ce fichier du brouillon' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(save.mock.calls[0]?.[0].files).toHaveLength(1);
  });
  it('rejects unsafe and duplicate file paths without adding a file', async () => {
    const user = userEvent.setup();
    render(<SkillEditor onSave={vi.fn()} onClose={vi.fn()} />);
    const path = screen.getByRole('textbox', { name: 'Chemin du nouveau fichier' });
    for (const value of ['../secret', 'SKILL.md', '/absolute']) {
      await user.clear(path);
      await user.type(path, value);
      await user.click(screen.getByRole('button', { name: 'Créer un fichier vide' }));
      expect(screen.getByRole('alert')).toHaveTextContent('chemin relatif unique');
    }
    expect(screen.getAllByRole('button', { name: 'SKILL.md' })).toHaveLength(1);
  });
  it('shows a binary attachment without exposing an editable text control', async () => {
    const user = userEvent.setup();
    render(
      <SkillEditor
        initial={{
          name: 'binary',
          description: 'Asset',
          files: [
            { path: 'SKILL.md', mediaType: 'text/markdown', contentBase64: btoa('# Instructions') },
            {
              path: 'assets/file.bin',
              mediaType: 'application/octet-stream',
              contentBase64: 'AP8=',
            },
          ],
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'assets/file.bin' }));
    expect(screen.getByText('Fichier binaire conservé dans le package.')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Contenu de assets/file.bin' }),
    ).not.toBeInTheDocument();
  });
  it('closes an unchanged editor directly, retains a draft when discard is canceled', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const view = render(<SkillEditor onSave={vi.fn()} onClose={close} />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(close).toHaveBeenCalledOnce();
    view.unmount();
    render(<SkillEditor onSave={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Nom du skill' }), 'draft');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }),
    );
    expect(screen.getByRole('textbox', { name: 'Nom du skill' })).toHaveValue('draft');
  });
});
