import { useState } from 'react';

/** Presentation state of the workspace frame: panels, mobile navigation, search, skeleton preview. */
export function useWorkspaceShell(contextOpenByDefault = true) {
  const [search, setSearch] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [context, setContext] = useState({
    defaultOpen: contextOpenByDefault,
    open: contextOpenByDefault,
  });
  if (context.defaultOpen !== contextOpenByDefault) {
    setContext({ defaultOpen: contextOpenByDefault, open: contextOpenByDefault });
  }
  const isContextOpen =
    context.defaultOpen === contextOpenByDefault ? context.open : contextOpenByDefault;
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
    toggleContext: () => setContext({ defaultOpen: contextOpenByDefault, open: !isContextOpen }),
    toggleLoading: () => setIsPreviewLoading((value) => !value),
    toggleNavigation: () => setIsNavigationOpen((value) => !value),
  };
}
