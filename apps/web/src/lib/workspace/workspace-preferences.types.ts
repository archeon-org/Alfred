export type WorkspaceDensity = 'comfortable' | 'compact';
export type AppearanceTheme = 'light' | 'dark' | 'system';
export type AppearanceAccent = 'sage' | 'blue' | 'violet' | 'rose' | 'amber';
export type ReadingWidth = 'centered' | 'wide';

export interface AppearancePreferences {
  readonly version: 1;
  readonly theme: AppearanceTheme;
  readonly accent: AppearanceAccent;
  readonly density: WorkspaceDensity;
  readonly readingWidth: ReadingWidth;
  readonly reducedMotion: boolean;
  readonly contextOpenByDefault: boolean;
}

export interface WorkspacePreferences extends AppearancePreferences {
  readonly storageAvailable: boolean;
  readonly setTheme: (theme: AppearanceTheme) => void;
  readonly setAccent: (accent: AppearanceAccent) => void;
  readonly setDensity: (density: WorkspaceDensity) => void;
  readonly setReadingWidth: (readingWidth: ReadingWidth) => void;
  readonly setReducedMotion: (reducedMotion: boolean) => void;
  readonly setContextOpenByDefault: (open: boolean) => void;
  readonly resetPreferences: () => void;
}
