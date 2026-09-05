import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureGate } from '@/components/feature-flags/feature-gate';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

vi.mock('@/hooks/feature-flags/use-feature-flags-query');

const mockedUseFeatureFlagsQuery = vi.mocked(useFeatureFlagsQuery);

describe('FeatureGate', () => {
  beforeEach(() => {
    mockedUseFeatureFlagsQuery.mockReturnValue({
      flags: DISABLED_FEATURE_FLAGS,
      reload: vi.fn(),
      status: 'ready',
    });
  });

  it('renders children only when the server flag is enabled', () => {
    const { rerender } = render(
      <FeatureGate feature="googleOAuth" fallback={<span>disabled</span>}>
        <span>enabled</span>
      </FeatureGate>,
    );

    expect(screen.getByText('disabled')).toBeVisible();
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();

    mockedUseFeatureFlagsQuery.mockReturnValue({
      flags: { ...DISABLED_FEATURE_FLAGS, googleOAuth: true },
      reload: vi.fn(),
      status: 'ready',
    });
    rerender(
      <FeatureGate feature="googleOAuth" fallback={<span>disabled</span>}>
        <span>enabled</span>
      </FeatureGate>,
    );

    expect(screen.getByText('enabled')).toBeVisible();
  });
});
