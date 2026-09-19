import { useSyncExternalStore } from 'react';

function getTabletQuery() {
  const breakpoint =
    getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-md').trim() ||
    '48rem';
  // Environments without media queries (such as jsdom) use the narrow layout.
  return window.matchMedia?.(`(min-width: ${breakpoint})`);
}

function subscribe(onChange: () => void) {
  const query = getTabletQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function getSnapshot() {
  return getTabletQuery()?.matches ?? false;
}

/**
 * True from the `md` breakpoint up: the navigation is a column, the panels own their fold
 * controls and the chat gutter offers the way back. Below it, one narrow bar carries them.
 */
export function useTabletWorkspace() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
