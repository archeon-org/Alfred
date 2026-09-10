import { useLayoutEffect } from 'react';
import { useWorkspacePreferences } from './use-workspace-preferences';

/** The document owns appearance so dialogs rendered in portals inherit the same theme. */
export function useAppearanceEffects(): void {
  const { theme, accent, density, readingWidth, reducedMotion } = useWorkspacePreferences();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme;
      root.dataset.accent = accent;
      root.dataset.density = density;
      root.dataset.readingWidth = readingWidth;
      root.dataset.reducedMotion = String(reducedMotion);
    };
    apply();
    if (theme === 'system') media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [theme, accent, density, readingWidth, reducedMotion]);
}
