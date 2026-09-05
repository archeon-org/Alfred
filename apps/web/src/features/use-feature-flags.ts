import { useContext } from 'react';
import { FeatureFlagsContext } from './feature-flags-context';

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (context === null) throw new Error('useFeatureFlags must be used inside FeatureFlagsProvider');
  return context;
}
