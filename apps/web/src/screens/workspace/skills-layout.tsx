import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { SkillWriteInput } from '@alfred/contracts';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';

function ImportDraftScope() {
  const [importedSkill, setImportedSkill] = useState<SkillWriteInput>();
  return <Outlet context={{ importedSkill, setImportedSkill }} />;
}
/** Imported packages stay in React memory, never in URL/history/browser storage. */
export function SkillsLayout() {
  const { userId } = useWorkspaceAccount();
  return <ImportDraftScope key={userId} />;
}
