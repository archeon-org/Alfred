import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSkillDraft } from '@/hooks/skills/use-skill-draft';
import { encodeSkillFile } from '@/lib/skills/skill-package';

describe('skill draft byte preservation', () => {
  const initial = {
    name: 'analyze-data',
    description: 'Analyze data',
    files: [
      encodeSkillFile(
        'SKILL.md',
        '\uFEFF---\r\nname: analyze-data\r\ndescription: Analyze data\r\n---\r\n# Instructions\r\n',
      ),
    ],
  };

  it('saves an untouched draft without removing its UTF-8 BOM or changing its bytes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSkillDraft({ initial, onSave, onClose: vi.fn() }));
    expect(result.current.dirty).toBe(false);
    await act(() => result.current.save());
    expect(onSave).toHaveBeenCalledWith(initial);
  });

  it('keeps instruction bytes when only another package file changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSkillDraft({ initial, onSave, onClose: vi.fn() }));
    const asset = encodeSkillFile('assets/example.txt', 'Example');
    act(() => result.current.setDraft((draft) => ({ ...draft, files: [...draft.files, asset] })));
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save());
    expect(onSave).toHaveBeenCalledWith({ ...initial, files: [...initial.files, asset] });
  });
});
