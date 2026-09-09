import { describe, expect, it } from 'vitest';

import { initialTitle, toConversationDto } from '@api/modules/conversations/domain/conversation';
import {
  hasProjectChanges,
  optionalText,
  toProjectDto,
} from '@api/modules/projects/domain/project';
import { conversationRow, projectRow } from '../../../../support/project-fixtures';

describe('project domain', () => {
  it('projects a row to the public DTO without tenant or owner identifiers', () => {
    const dto = toProjectDto(projectRow({ archivedAt: new Date('2026-09-10T00:00:00.000Z') }));

    expect(dto).toEqual({
      archivedAt: '2026-09-10T00:00:00.000Z',
      context: null,
      createdAt: '2026-09-09T10:00:00.000Z',
      description: 'Un espace pour penser la prochaine version.',
      id: projectRow().id,
      kind: 'named',
      name: 'Refonte du portail',
      pinnedAt: null,
      status: 'active',
      updatedAt: '2026-09-09T11:00:00.000Z',
    });
    expect(Object.isFrozen(dto)).toBe(true);
  });

  it('treats blank documents as cleared and detects empty updates', () => {
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText('  \n ')).toBeNull();
    expect(optionalText('# Titre')).toBe('# Titre');
    expect(hasProjectChanges({})).toBe(false);
    expect(hasProjectChanges({ description: undefined })).toBe(false);
    expect(hasProjectChanges({ context: '' })).toBe(true);
  });
});

describe('conversation domain', () => {
  it('defaults the title when none is given and records a user title otherwise', () => {
    expect(initialTitle(undefined)).toEqual({
      title: 'Nouvelle conversation',
      titleSource: 'none',
    });
    expect(initialTitle('   ')).toEqual({ title: 'Nouvelle conversation', titleSource: 'none' });
    expect(initialTitle(' Analyse ')).toEqual({ title: 'Analyse', titleSource: 'user' });
  });

  it('exposes the parent project kind and ISO timestamps', () => {
    expect(toConversationDto(conversationRow(), 'implicit')).toEqual({
      archivedAt: null,
      createdAt: '2026-09-09T12:00:00.000Z',
      id: conversationRow().id,
      lastActivityAt: null,
      pinnedAt: null,
      projectId: projectRow().id,
      projectKind: 'implicit',
      title: 'Analyse de l’existant',
      titleSource: 'user',
      updatedAt: '2026-09-09T12:00:00.000Z',
    });
  });
});
