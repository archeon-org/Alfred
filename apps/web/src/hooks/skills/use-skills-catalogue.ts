import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SkillSummary } from '@alfred/contracts';
import { useCatalogueSearch } from '@/hooks/skills/use-catalogue-search';
import { useSkillImport } from '@/hooks/skills/use-skill-import';
import { useSkills } from '@/hooks/skills/use-skills';
import { importSkillPackage, exportSkillPackage } from '@/lib/skills/skill-package';
import { downloadSkill, skillError } from '@/lib/skills/skill-errors';

export function useSkillsCatalogue() {
  const { input, search, setInput } = useCatalogueSearch();
  const { query, skills, get, publish, remove } = useSkills(search);
  const navigate = useNavigate();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const { setImportedSkill } = useSkillImport();
  useEffect(() => setImportedSkill(undefined), [setImportedSkill]);
  const [deleting, setDeleting] = useState<SkillSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function act(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setError(skillError(reason));
    } finally {
      setPending(false);
    }
  }
  const create = () => void navigate('/app/skills/new');
  const edit = (skill: SkillSummary) =>
    void navigate(`/app/skills/${encodeURIComponent(skill.id)}/edit`);
  const importFile = (file: File) =>
    void act(async () => {
      try {
        const imported = await importSkillPackage(file);
        if (!active.current) return;
        setImportedSkill(imported);
        await navigate('/app/skills/new');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Import impossible.');
      }
    });
  const exportFile = (skill: SkillSummary) =>
    void act(async () => downloadSkill(await exportSkillPackage(await get(skill.id)), skill.name));
  const publishSkill = (skill: SkillSummary) =>
    void act(async () => {
      await publish(skill);
      setNotice(`${skill.name} publié.`);
    });
  const requestDelete = (skill: SkillSummary) => {
    setError(null);
    setDeleting(skill);
  };
  const confirmDelete = () => {
    if (deleting)
      void act(async () => {
        await remove(deleting);
        setDeleting(null);
        setNotice('Skill supprimé.');
      });
  };
  return {
    input,
    search,
    setInput,
    query,
    skills,
    deleting,
    setDeleting,
    pending,
    error,
    notice,
    create,
    edit,
    importFile,
    exportFile,
    publishSkill,
    requestDelete,
    confirmDelete,
  };
}
