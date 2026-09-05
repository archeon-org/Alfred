import { useSyncExternalStore } from 'react';

function getDesktopQuery() {
  const breakpoint = getComputedStyle(document.documentElement)
    .getPropertyValue('--breakpoint-workspace')
    .trim();
  // Environments without the stylesheet (such as jsdom) use the stacked layout.
  return breakpoint ? window.matchMedia?.(`(min-width: ${breakpoint})`) : undefined;
}

function subscribe(onChange: () => void) {
  const query = getDesktopQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function getSnapshot() {
  return getDesktopQuery()?.matches ?? false;
}

export function useDesktopWorkspace() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
