import type { ProjectKind, ProjectStatus } from '@alfred/contracts';
import { ApiException } from '../../../common/errors/api.exception';

/** Reads stay allowed on any project; writes stop once it is archived or being deleted. */
export function assertProjectWritable(project: { readonly status: ProjectStatus }): void {
  if (project.status === 'deleting') {
    throw new ApiException(409, 'project_deleting', 'Project is being deleted.');
  }
  if (project.status === 'archived') {
    throw new ApiException(409, 'project_archived', 'Project is archived.');
  }
}

/** An implicit project stays a private shell for one chat until it is promoted (ALF-DEC-034 §2–4). */
export function assertProjectNamed(project: { readonly kind: ProjectKind }): void {
  if (project.kind === 'implicit') {
    throw new ApiException(
      409,
      'project_implicit',
      'Convert the chat into a project before using it as one.',
    );
  }
}
