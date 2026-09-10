import type { Dispatch, SetStateAction } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { SkillWriteInput } from '@alfred/contracts';

export function useSkillImport() {
  return useOutletContext<{
    importedSkill: SkillWriteInput | undefined;
    setImportedSkill: Dispatch<SetStateAction<SkillWriteInput | undefined>>;
  }>();
}
