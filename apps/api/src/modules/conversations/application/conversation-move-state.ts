import { ApiException } from '../../../common/errors/api.exception';
import type { ProjectEntity } from '../../projects/infrastructure/persistence/project.entity';

export function moveNotAllowed(): ApiException {
  return new ApiException(
    409,
    'conversation_move_not_allowed',
    'Only standalone conversations can be added to a named project.',
  );
}

/** No implicit project data may be discarded or merged into the target silently. */
export function assertConversationMoveSource(
  project: ProjectEntity,
  conversationCount: number,
  hasContextDocuments = false,
): void {
  if (project.kind !== 'implicit') throw moveNotAllowed();
  if (
    hasContextDocuments ||
    project.context ||
    project.description ||
    project.name ||
    project.pinnedAt !== null ||
    conversationCount !== 1
  ) {
    throw new ApiException(
      409,
      'conversation_source_has_context',
      'The standalone project contains data that must be preserved.',
    );
  }
}
