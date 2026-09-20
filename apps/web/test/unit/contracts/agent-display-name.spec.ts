import { describe, expect, it } from 'vitest';

import { agentDisplayName } from '@alfred/contracts';

describe('agentDisplayName', () => {
  it.each([
    ['base_react_basic', 'Base react basic'],
    ['CFTAgent_LightRAG_HTTP', 'CFTAgent LightRAG HTTP'],
    ['elastic-rag', 'Elastic rag'],
    ['ClarifyAgent', 'ClarifyAgent'],
    ['__private__name__', 'Private name'],
    ['___', '___'],
  ])('%s → %s', (name, label) => {
    expect(agentDisplayName(name)).toBe(label);
  });
});
