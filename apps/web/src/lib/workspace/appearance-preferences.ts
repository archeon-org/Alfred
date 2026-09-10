import type { AppearancePreferences } from './workspace-preferences.types';

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  version: 1,
  theme: 'light',
  accent: 'sage',
  density: 'comfortable',
  readingWidth: 'centered',
  reducedMotion: false,
  contextOpenByDefault: true,
};

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback;
}

/** Only allow bounded visual preferences; unknown versions and fields never become app state. */
export function decodeAppearance(value: unknown): AppearancePreferences {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1)
    return DEFAULT_APPEARANCE;
  const record = value as Record<string, unknown>;
  return {
    version: 1,
    theme: choice(record.theme, ['light', 'dark', 'system'], DEFAULT_APPEARANCE.theme),
    accent: choice(
      record.accent,
      ['sage', 'blue', 'violet', 'rose', 'amber'],
      DEFAULT_APPEARANCE.accent,
    ),
    density: choice(record.density, ['comfortable', 'compact'], DEFAULT_APPEARANCE.density),
    readingWidth: choice(
      record.readingWidth,
      ['centered', 'wide'],
      DEFAULT_APPEARANCE.readingWidth,
    ),
    reducedMotion: typeof record.reducedMotion === 'boolean' ? record.reducedMotion : false,
    contextOpenByDefault:
      typeof record.contextOpenByDefault === 'boolean' ? record.contextOpenByDefault : true,
  };
}
