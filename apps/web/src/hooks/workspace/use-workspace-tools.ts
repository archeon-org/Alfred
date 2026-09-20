import { useState } from 'react';

import type { WorkspaceToolTab, WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';

/** Mount at screen level so collapsing a panel keeps the selected tab. */
export function useWorkspaceTools(): WorkspaceToolsState {
  const [activeTab, setActiveTab] = useState<WorkspaceToolTab>('teams');
  return { activeTab, setActiveTab };
}
