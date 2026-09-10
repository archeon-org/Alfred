import { useEffect, useRef, useState } from 'react';
import { SKILL_MAX_FILES, SKILL_MAX_PACKAGE_BYTES, type SkillFileInput } from '@alfred/contracts';
import { assertPackagePath, bytesToBase64, mediaTypeForPath } from '@/lib/skills/package-content';
import { decodeSkillFile, encodeSkillFile } from '@/lib/skills/skill-package';

interface Options {
  readonly files: SkillFileInput[];
  readonly onChange: (files: SkillFileInput[]) => void;
  readonly disabled: boolean;
  readonly onBusy: (busy: boolean) => void;
}

function validTarget(path: string, files: SkillFileInput[]): boolean {
  try {
    assertPackagePath(path);
    const target = path.toLowerCase();
    return !files.some((file) => {
      const existing = file.path.toLowerCase();
      return (
        existing === target ||
        existing.startsWith(`${target}/`) ||
        target.startsWith(`${existing}/`)
      );
    });
  } catch {
    return false;
  }
}

export function useSkillFiles({ files, onChange, disabled, onBusy }: Options) {
  const [selected, select] = useState('SKILL.md');
  const [path, setPath] = useState('references/notes.md');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const latest = useRef(files);
  useEffect(() => {
    latest.current = files;
  }, [files]);
  const current = files.find((file) => file.path === selected) ?? files[0];
  let text: string | null = null;
  if (current) {
    try {
      text = decodeSkillFile(current);
    } catch {
      /* Preserve binary bytes. */
    }
  }
  const add = async (file?: File) => {
    if (disabled || pending.current) return;
    setError(null);
    const target = path.trim();
    if (!validTarget(target, files)) {
      setError('Choisissez un chemin relatif unique, par exemple scripts/analyse.py.');
      return;
    }
    if (files.length >= SKILL_MAX_FILES || (file?.size ?? 0) > SKILL_MAX_PACKAGE_BYTES) {
      setError('Le fichier ou le nombre de fichiers dépasse la limite autorisée.');
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusy(true);
    try {
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
      const nextFiles = latest.current;
      if (!validTarget(target, nextFiles) || nextFiles.length >= SKILL_MAX_FILES) {
        setError('Choisissez un chemin relatif unique, par exemple scripts/analyse.py.');
        return;
      }
      onChange([
        ...nextFiles,
        {
          path: target,
          contentBase64: bytesToBase64(bytes),
          mediaType: file?.type || mediaTypeForPath(target),
        },
      ]);
      select(target);
    } catch {
      setError('Impossible de lire ce fichier.');
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  const update = (value: string) => {
    if (disabled || busy || !current || text === null) return;
    onChange(
      files.map((file) =>
        file.path === current.path ? encodeSkillFile(file.path, value, file.mediaType) : file,
      ),
    );
  };
  const remove = () => {
    if (disabled || busy || !current || current.path === 'SKILL.md') return;
    onChange(files.filter((file) => file.path !== current.path));
    select('SKILL.md');
  };
  return { current, text, select, path, setPath, error, busy, add, update, remove };
}
