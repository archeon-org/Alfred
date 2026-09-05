import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FeatureFlagsContext, type FeatureFlagsContextValue } from './feature-flags-context';
import { FeatureGate } from './feature-gate';

const baseValue: FeatureFlagsContextValue = {
  flags: {
    agentRuntime: false,
    agUiStreaming: false,
    fileUploads: false,
    generativeUi: false,
    googleOAuth: false,
    mcpApps: false,
    runtimeMemory: false,
    skills: false,
    teams: false,
  },
  reload: () => Promise.resolve(),
  status: 'ready',
};

describe('FeatureGate', () => {
  it('renders children only when the server flag is enabled', () => {
    const { rerender } = render(
      <FeatureFlagsContext.Provider value={baseValue}>
        <FeatureGate feature="googleOAuth" fallback={<span>disabled</span>}>
          <span>enabled</span>
        </FeatureGate>
      </FeatureFlagsContext.Provider>,
    );

    expect(screen.getByText('disabled')).toBeVisible();
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();

    rerender(
      <FeatureFlagsContext.Provider
        value={{ ...baseValue, flags: { ...baseValue.flags, googleOAuth: true } }}
      >
        <FeatureGate feature="googleOAuth" fallback={<span>disabled</span>}>
          <span>enabled</span>
        </FeatureGate>
      </FeatureFlagsContext.Provider>,
    );

    expect(screen.getByText('enabled')).toBeVisible();
  });
});
