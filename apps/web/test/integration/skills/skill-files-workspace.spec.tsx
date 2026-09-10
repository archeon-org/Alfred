import { useState } from 'react';
import { SKILL_MAX_FILES, SKILL_MAX_PACKAGE_BYTES, type SkillFileInput } from '@alfred/contracts';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SkillFilesEditor } from '@/components/workspace/skills/skill-files-editor';
import { useSkillFiles } from '@/hooks/skills/use-skill-files';
import { buildSkillFileTree } from '@/lib/skills/skill-file-tree';
import { encodeSkillFile } from '@/lib/skills/skill-package';

const initial = [
  encodeSkillFile('SKILL.md', '# Instructions'),
  encodeSkillFile('scripts/nested/run.py', 'print(1)\nprint(2)'),
  encodeSkillFile('references/notes.md', '# Notes'),
];
function Workspace({
  disabled = false,
  files = initial,
}: {
  disabled?: boolean;
  files?: SkillFileInput[];
}) {
  const [draft, setDraft] = useState(files);
  return (
    <SkillFilesEditor files={draft} onChange={setDraft} disabled={disabled} onBusy={vi.fn()} />
  );
}

describe('Skill file workspace', () => {
  it('groups full-path file buttons into keyboard-accessible folders', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const folder = screen.getByRole('button', { name: 'Dossier scripts' });
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    folder.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('button', { name: 'scripts/nested/run.py' })).not.toBeInTheDocument();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'scripts/nested/run.py' }));
    expect(screen.getByRole('textbox', { name: 'Contenu de scripts/nested/run.py' })).toHaveValue(
      'print(1)\nprint(2)',
    );
  });

  it('edits independently, previews Markdown and returns to instructions after removal', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    await user.click(screen.getByRole('button', { name: 'scripts/nested/run.py' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Contenu de scripts/nested/run.py' }),
      '\n# Done',
    );
    await user.click(screen.getByRole('button', { name: 'SKILL.md' }));
    await user.click(screen.getByRole('tab', { name: 'Aperçu' }));
    expect(screen.getByRole('heading', { name: 'Instructions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'scripts/nested/run.py' }));
    expect(screen.getByRole('textbox', { name: 'Contenu de scripts/nested/run.py' })).toHaveValue(
      'print(1)\nprint(2)\n# Done',
    );
    await user.click(screen.getByRole('button', { name: 'Retirer ce fichier du brouillon' }));
    expect(screen.getByRole('button', { name: 'SKILL.md' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Retirer ce fichier du brouillon' }),
    ).not.toBeInTheDocument();
  });

  it('creates nested files and rejects unsafe, duplicate and colliding paths', async () => {
    const user = userEvent.setup();
    render(<Workspace />);
    const path = screen.getByRole('textbox', { name: 'Chemin du nouveau fichier' });
    for (const value of ['../secret', 'skill.MD', 'scripts', 'SKILL.md/child']) {
      await user.clear(path);
      await user.type(path, value);
      await user.click(screen.getByRole('button', { name: 'Créer un fichier vide' }));
      expect(screen.getByRole('alert')).toHaveTextContent('chemin relatif unique');
    }
    await user.clear(path);
    await user.type(path, 'assets/new/data.txt');
    await user.click(screen.getByRole('button', { name: 'Créer un fichier vide' }));
    expect(screen.getByRole('textbox', { name: 'Contenu de assets/new/data.txt' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'assets/new/data.txt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps binary attachments byte-exact while editing another file', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const binary = {
      path: 'assets/file.bin',
      mediaType: 'application/octet-stream',
      contentBase64: 'AP8=',
    };
    render(
      <SkillFilesEditor
        files={[...initial, binary]}
        onChange={change}
        disabled={false}
        onBusy={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: binary.path }));
    expect(screen.getByText('Fichier binaire conservé dans le package.')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: `Contenu de ${binary.path}` }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'SKILL.md' }));
    await user.type(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' }), '!');
    expect(change).toHaveBeenLastCalledWith([
      ...initial.slice(0, 1).map(() => encodeSkillFile('SKILL.md', '# Instructions!')),
      ...initial.slice(1),
      binary,
    ]);
  });

  it('keeps navigation available and all mutations disabled', async () => {
    const user = userEvent.setup();
    render(<Workspace disabled />);
    await user.click(screen.getByRole('button', { name: 'scripts/nested/run.py' }));
    const region = screen.getByRole('region', { name: 'Fichiers du skill' });
    expect(
      within(region).getByRole('textbox', { name: 'Contenu de scripts/nested/run.py' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Créer un fichier vide' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retirer ce fichier du brouillon' })).toBeDisabled();
    expect(screen.getByLabelText('Joindre un fichier à ce chemin')).toBeDisabled();
  });
});

describe('Skill file upload controls', () => {
  it.each([
    ['references/new.md', 'text/markdown'],
    ['assets/config.json', 'application/json'],
    ['assets/data.bin', 'application/octet-stream'],
  ])('assigns the type of an empty file at %s', async (path, mediaType) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SkillFilesEditor
        files={[initial[0]!]}
        onChange={onChange}
        disabled={false}
        onBusy={vi.fn()}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Chemin du nouveau fichier' });
    await user.clear(input);
    await user.type(input, path);
    await user.click(screen.getByRole('button', { name: 'Créer un fichier vide' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      initial[0],
      { path, contentBase64: '', mediaType },
    ]);
  });

  it('infers an untyped upload from its target path and preserves its content', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SkillFilesEditor
        files={[initial[0]!]}
        onChange={onChange}
        disabled={false}
        onBusy={vi.fn()}
      />,
    );
    const file = new File(['# Notes'], 'original.txt');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode('# Notes').buffer),
    });
    await user.upload(screen.getByLabelText('Joindre un fichier à ce chemin'), file);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      initial[0],
      encodeSkillFile('references/notes.md', '# Notes', 'text/markdown'),
    ]);
  });

  it('uploads an attachment through its labeled input and resets the chooser', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBusy = vi.fn();
    render(
      <SkillFilesEditor
        files={[initial[0]!]}
        onChange={onChange}
        disabled={false}
        onBusy={onBusy}
      />,
    );
    const input = screen.getByLabelText('Joindre un fichier à ce chemin');
    const file = new File(['data'], 'data.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode('data').buffer),
    });
    await user.upload(input, file);
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      initial[0],
      encodeSkillFile('references/notes.md', 'data', 'text/plain'),
    ]);
    expect(input).toHaveValue('');
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it('renders an empty package and recovers when the selected file disappears', async () => {
    const user = userEvent.setup();
    const view = render(
      <SkillFilesEditor files={initial} onChange={vi.fn()} disabled={false} onBusy={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'scripts/nested/run.py' }));
    view.rerender(
      <SkillFilesEditor
        files={[initial[0]!]}
        onChange={vi.fn()}
        disabled={false}
        onBusy={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Contenu de SKILL.md' })).toHaveValue(
      '# Instructions',
    );
    view.rerender(
      <SkillFilesEditor files={[]} onChange={vi.fn()} disabled={false} onBusy={vi.fn()} />,
    );
    expect(screen.getByText('Ajoutez un fichier pour commencer.')).toBeInTheDocument();
  });
});

describe('Skill file operations', () => {
  it('preserves latest files during upload, locks concurrent additions and reports busy state', async () => {
    const change = vi.fn();
    const onBusy = vi.fn();
    let finish!: (bytes: ArrayBuffer) => void;
    const file = new File(['x'], 'asset.bin', { type: 'application/octet-stream' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        }),
    });
    const { result, rerender } = renderHook(
      ({ files }) => useSkillFiles({ files, onChange: change, disabled: false, onBusy }),
      { initialProps: { files: initial } },
    );
    act(() => result.current.setPath('assets/new.bin'));
    let upload!: Promise<void>;
    act(() => {
      upload = result.current.add(file);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => result.current.add());
    expect(change).not.toHaveBeenCalled();
    const nextFiles = [...initial, encodeSkillFile('other.md', 'New')];
    rerender({ files: nextFiles });
    await act(async () => {
      finish(new Uint8Array([0, 255]).buffer);
      await upload;
    });
    expect(change).toHaveBeenCalledExactlyOnceWith([
      ...nextFiles,
      { path: 'assets/new.bin', contentBase64: 'AP8=', mediaType: 'application/octet-stream' },
    ]);
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
    expect(result.current.busy).toBe(false);
  });

  it('reports failed reads, file-count and attachment-size limits', async () => {
    const change = vi.fn();
    const onBusy = vi.fn();
    const file = new File(['x'], 'bad.bin');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('read failed')),
    });
    const { result, rerender } = renderHook(
      ({ files }) => useSkillFiles({ files, onChange: change, disabled: false, onBusy }),
      { initialProps: { files: [initial[0]!] } },
    );
    await act(async () => result.current.add(file));
    expect(result.current.error).toBe('Impossible de lire ce fichier.');
    expect(onBusy).toHaveBeenLastCalledWith(false);
    Object.defineProperty(file, 'size', { value: SKILL_MAX_PACKAGE_BYTES + 1 });
    await act(async () => result.current.add(file));
    expect(result.current.error).toContain('limite autorisée');
    rerender({
      files: Array.from({ length: SKILL_MAX_FILES }, (_, index) =>
        encodeSkillFile(`file${index}.txt`, ''),
      ),
    });
    await act(async () => result.current.add());
    expect(result.current.error).toContain('limite autorisée');
    expect(change).not.toHaveBeenCalled();
  });

  it('derives sorted nested folders without mutating the package', () => {
    const files = Object.freeze([
      encodeSkillFile('z.txt', ''),
      encodeSkillFile('scripts/b.py', ''),
      encodeSkillFile('scripts/a.py', ''),
      initial[0]!,
    ]);
    const tree = buildSkillFileTree(files);
    expect(tree.map((node) => node.path)).toEqual(['SKILL.md', 'scripts', 'z.txt']);
    expect(tree[1]?.children.map((node) => node.name)).toEqual(['a.py', 'b.py']);
    expect(files[0]?.path).toBe('z.txt');
    expect(buildSkillFileTree([])).toEqual([]);
  });
});
