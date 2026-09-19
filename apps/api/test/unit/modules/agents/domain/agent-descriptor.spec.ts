import { describe, expect, it } from 'vitest';
import {
  toSubAgentSummary,
  type RuntimeAssistant,
} from '@api/modules/agents/domain/agent-descriptor';

const assistant = (
  description: string | null | undefined,
  name = 'topology',
): RuntimeAssistant => ({
  assistant_id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
  graph_id: 'topology',
  name,
  description,
});
const metadata = (fields: Record<string, unknown>) => JSON.stringify(fields);

describe('toSubAgentSummary', () => {
  it('publishes the runtime metadata of a declared sub-agent', () => {
    expect(
      toSubAgentSummary(
        assistant(
          metadata({
            description: 'AI-Ops topology explorer over a NetworkX graph backend.',
            is_subagent: true,
            short_description: 'AI-Ops infrastructure topology explorer.',
            visibility: { orchestrator: true, ui: false },
            tags: ['topology', 'graph'],
          }),
        ),
      ),
    ).toEqual({
      id: '98480af1-6fd5-51b1-9b43-97834987e6ea',
      graphId: 'topology',
      name: 'topology',
      shortDescription: 'AI-Ops infrastructure topology explorer.',
      description: 'AI-Ops topology explorer over a NetworkX graph backend.',
      tags: ['topology', 'graph'],
    });
  });

  it('ignores visibility.ui: only is_subagent decides', () => {
    expect(
      toSubAgentSummary(assistant(metadata({ is_subagent: true, visibility: { ui: false } }))),
    ).toMatchObject({ shortDescription: null, description: null, tags: [] });
  });

  it.each([
    ['a top-level agent', metadata({ is_subagent: false })],
    ['a missing flag', metadata({ description: 'No flag' })],
    ['a string flag', metadata({ is_subagent: 'true' })],
    ['a plain-text description', 'Red Hat expert'],
    ['a JSON array', '[true]'],
    ['a null description', null],
    ['an absent description', undefined],
  ])('rejects %s', (_label, description) => {
    expect(toSubAgentSummary(assistant(description))).toBeNull();
  });

  it('bounds untrusted text and tags instead of hiding the agent', () => {
    const summary = toSubAgentSummary(
      assistant(
        metadata({
          is_subagent: true,
          description: 'd'.repeat(5_000),
          short_description: '   ',
          tags: [
            'rag',
            'rag',
            42,
            '',
            'x'.repeat(41),
            ...Array.from({ length: 30 }, (_, i) => `t${i}`),
          ],
        }),
        '  ',
      ),
    );
    expect(summary?.name).toBe('topology');
    expect(summary?.shortDescription).toBeNull();
    expect(summary?.description).toHaveLength(2_000);
    expect(summary?.description?.endsWith('…')).toBe(true);
    expect(summary?.tags[0]).toBe('rag');
    expect(summary?.tags).toHaveLength(16);
  });
});
