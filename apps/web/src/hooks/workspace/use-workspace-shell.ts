import { useState } from 'react';

/** Presentation state of the workspace frame: panels, mobile navigation, search, skeleton preview. */
export function useWorkspaceShell() {
  const [search, setSearch] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  return {
    closeNavigation: () => setIsNavigationOpen(false),
    isContextOpen,
    isNavigationOpen,
    isPreviewLoading,
    isSidebarOpen,
    search,
    setIsSidebarOpen,
    setSearch,
    toggleContext: () => setIsContextOpen((value) => !value),
    toggleLoading: () => setIsPreviewLoading((value) => !value),
    toggleNavigation: () => setIsNavigationOpen((value) => !value),
  };
}
