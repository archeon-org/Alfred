import type { SkillDetail, SkillWriteInput } from '@alfred/contracts';
import { vi } from 'vitest';
import { createWorkspaceApi } from './workspace-api';
import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

export const SKILL_ID = '00000000-0000-4000-8000-000000000001';
export function skillFixture(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: SKILL_ID,
    name: 'synthese',
    description: 'Résumer un document',
    version: 1,
    currentVersion: 1,
    status: 'draft',
    enabled: true,
    publishedVersion: null,
    fileCount: 1,
    totalBytes: 10,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    files: [{ path: 'SKILL.md', contentBase64: btoa('# Synthese'), mediaType: 'text/markdown' }],
    ...overrides,
  };
}
export function createSkillsApi(
  seed: SkillDetail[] = [],
  enabled = true,
  history: SkillDetail[] = [],
) {
  const workspace = createWorkspaceApi();
  let skills = seed;
  let versions = history.length ? history : seed;
  let conflict = false;
  const calls: { method: string; body: unknown }[] = [];
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as SkillWriteInput & {
            expectedVersion: number;
            sourceVersion: number;
            enabled: boolean;
          })
        : undefined;
    if (url.pathname === '/api/features')
      return json({ success: true, data: { ...DISABLED_FEATURE_FLAGS, skills: enabled } });
    if (!url.pathname.startsWith('/api/skills')) return workspace.fetch(input, init);
    calls.push({ method, body });
    if (conflict && (method === 'PUT' || method === 'POST'))
      return json(
        { success: false, error: { code: 'skill_version_conflict', message: 'Conflict' } },
        409,
      );
    if (url.pathname.endsWith('/versions')) {
      const before = Number(url.searchParams.get('before') ?? Infinity);
      const matches = versions
        .filter((item) => item.currentVersion < before)
        .sort((a, b) => b.currentVersion - a.currentVersion);
      const page = matches.slice(0, 20);
      return json({
        success: true,
        data: {
          items: page.map((item) => ({
            version: item.currentVersion,
            name: item.name,
            description: item.description,
            totalBytes: item.totalBytes,
            createdAt: item.createdAt,
            publishedAt: item.publishedVersion === item.currentVersion ? item.updatedAt : null,
          })),
          nextBefore: matches.length > 20 ? page.at(-1)!.currentVersion : null,
        },
      });
    }
    if (url.pathname.endsWith('/availability')) {
      skills = skills.map((skill) => ({
        ...skill,
        enabled: body!.enabled,
        version: skill.version + 1,
      }));
      return json({ success: true, data: skills[0] });
    }
    if (url.pathname.endsWith('/restore')) {
      const old = versions.find((item) => item.currentVersion === body!.sourceVersion)!;
      const current = skills[0]!;
      const restored = {
        ...current,
        name: old.name,
        description: old.description,
        files: old.files,
        version: current.version + 1,
        currentVersion: old.currentVersion,
        status:
          old.currentVersion === current.publishedVersion
            ? ('published' as const)
            : ('draft' as const),
      };
      skills = [restored];
      return json({ success: true, data: restored });
    }
    if (method === 'DELETE') {
      skills = [];
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && url.pathname.endsWith('/publish')) {
      skills = skills.map((skill) => ({
        ...skill,
        status: 'published',
        publishedVersion: skill.currentVersion,
        version: skill.version + 1,
      }));
      return json({ success: true, data: skills[0] });
    }
    if (method === 'POST' || method === 'PUT') {
      const previous = skills[0];
      const saved = skillFixture({
        ...previous,
        ...body,
        currentVersion:
          method === 'PUT' ? Math.max(0, ...versions.map((item) => item.currentVersion)) + 1 : 1,
        version: method === 'PUT' ? (previous?.version ?? 0) + 1 : 1,
        fileCount: body!.files.length,
      });
      skills = [saved];
      versions = [...versions, saved];
      return json({ success: true, data: saved });
    }
    return json({
      success: true,
      data:
        url.pathname === '/api/skills'
          ? {
              items: skills.filter((skill) =>
                `${skill.name} ${skill.description}`
                  .toLowerCase()
                  .includes((url.searchParams.get('search') ?? '').toLowerCase()),
              ),
              nextCursor: null,
            }
          : skills[0],
    });
  });
  return {
    ...workspace,
    fetch,
    skillCalls: calls,
    setConflict: () => {
      conflict = true;
    },
  };
}
