export type WorkspaceDensity = 'comfortable' | 'compact';
export type WorkspaceTextSize = 'standard' | 'comfortable';

export interface WorkspacePreferences {
  readonly density: WorkspaceDensity;
  readonly textSize: WorkspaceTextSize;
  readonly reducedMotion: boolean;
  readonly setDensity: (density: WorkspaceDensity) => void;
  readonly setTextSize: (textSize: WorkspaceTextSize) => void;
  readonly setReducedMotion: (reducedMotion: boolean) => void;
  readonly resetPreferences: () => void;
}
