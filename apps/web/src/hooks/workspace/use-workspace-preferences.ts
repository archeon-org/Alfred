import { useCallback, useState } from 'react';

import type {
  WorkspaceDensity,
  WorkspaceTextSize,
  WorkspacePreferences,
} from '@/lib/workspace/workspace-preferences.types';

export function useWorkspacePreferences(): WorkspacePreferences {
  const [density, setDensity] = useState<WorkspaceDensity>('comfortable');
  const [textSize, setTextSize] = useState<WorkspaceTextSize>('standard');
  const [reducedMotion, setReducedMotion] = useState(false);
  const resetPreferences = useCallback(() => {
    setDensity('comfortable');
    setTextSize('standard');
    setReducedMotion(false);
  }, []);

  return {
    density,
    textSize,
    reducedMotion,
    setDensity,
    setTextSize,
    setReducedMotion,
    resetPreferences,
  };
}
