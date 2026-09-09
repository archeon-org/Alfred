import { describe, expect, it } from 'vitest';
import { assertConversationMoveSource } from '@api/modules/conversations/application/conversation-move-state';
import { projectRow } from '../../../../support/project-fixtures';

describe('conversation move source rules', () => {
  it('accepts only an empty implicit shell containing exactly the moving chat', () => {
    expect(() =>
      assertConversationMoveSource(
        projectRow({ kind: 'implicit', name: null, context: null, description: null }),
        1,
      ),
    ).not.toThrow();
  });
  it('rejects named source and extra source data rather than discarding it', () => {
    expect(() => assertConversationMoveSource(projectRow(), 1)).toThrow(
      expect.objectContaining({ code: 'conversation_move_not_allowed' }),
    );
    for (const project of [
      projectRow({ kind: 'implicit', name: null, context: '# Keep', description: null }),
      projectRow({ kind: 'implicit', name: null, description: 'Keep' }),
    ]) {
      expect(() => assertConversationMoveSource(project, 1)).toThrow(
        expect.objectContaining({ code: 'conversation_source_has_context' }),
      );
    }
    expect(() =>
      assertConversationMoveSource(
        projectRow({ kind: 'implicit', name: null, description: null }),
        2,
      ),
    ).toThrow(expect.objectContaining({ code: 'conversation_source_has_context' }));
  });
});
