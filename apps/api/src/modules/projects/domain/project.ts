import type { Project, ProjectKind, ProjectStatus } from '@alfred/contracts';
import type { OwnerScope } from '../../../common/ownership/owner-scope';

export type { OwnerScope } from '../../../common/ownership/owner-scope';

/** Persistence-neutral view of a project row, including private ownership fields. */
export interface ProjectRecord extends OwnerScope {
  readonly id: string;
  readonly kind: ProjectKind;
  readonly name: string | null;
  readonly description: string | null;
  readonly context: string | null;
  readonly status: ProjectStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface ProjectChanges {
  readonly name?: string;
  readonly description?: string;
  readonly context?: string;
}

export const PROJECT_RESOURCE = 'project';

/** Empty text clears the field; the API never stores an empty string for optional documents. */
export function optionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim().length === 0 ? null : value;
}

export function hasProjectChanges(changes: ProjectChanges): boolean {
  return Object.values(changes).some((value) => value !== undefined);
}

/** Public DTO: tenant and owner identifiers are private (ALF-DEC-051, story 1.4). */
export function toProjectDto(record: ProjectRecord): Project {
  return Object.freeze({
    archivedAt: record.archivedAt === null ? null : record.archivedAt.toISOString(),
    context: record.context,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    kind: record.kind,
    name: record.name,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  });
}
