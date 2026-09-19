import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHORTCUT_PREFERENCES,
  decodeShortcutPreferences,
} from '@/lib/workspace/shortcut-preferences';

describe('shortcut preferences decoding', () => {
  it('keeps well-formed bindings for known actions and drops everything else', () => {
    const decoded = decodeShortcutPreferences({
      version: 1,
      bindings: {
        toggleContext: { code: 'Semicolon', shift: false, label: ';' },
        newConversation: { code: 'Quote', shift: true, label: '%' },
        unknownAction: { code: 'KeyX', shift: false, label: 'X' },
        toggleNavigation: { code: 'Key X', shift: false, label: 'X' },
        showShortcuts: { code: 'KeyX', shift: 'yes', label: 'X' },
      },
    });
    expect(decoded).toEqual({
      version: 1,
      bindings: {
        toggleContext: { code: 'Semicolon', shift: false, label: ';' },
        newConversation: { code: 'Quote', shift: true, label: '%' },
      },
    });
  });

  it('bounds the label and the code so a tampered store cannot inject arbitrary text', () => {
    const long = decodeShortcutPreferences({
      version: 1,
      bindings: {
        toggleContext: { code: 'Semicolon', shift: false, label: 'x'.repeat(17) },
        toggleNavigation: { code: 'Semicolon', shift: false, label: '' },
        showShortcuts: { code: `K${'a'.repeat(40)}`, shift: false, label: 'K' },
      },
    });
    expect(long.bindings).toEqual({});
  });

  it('falls back to the defaults for foreign shapes and other versions', () => {
    expect(decodeShortcutPreferences(null)).toBe(DEFAULT_SHORTCUT_PREFERENCES);
    expect(decodeShortcutPreferences('⌘/')).toBe(DEFAULT_SHORTCUT_PREFERENCES);
    expect(decodeShortcutPreferences({ version: 2, bindings: {} })).toBe(
      DEFAULT_SHORTCUT_PREFERENCES,
    );
    expect(decodeShortcutPreferences({ version: 1, bindings: 'none' })).toEqual({
      version: 1,
      bindings: {},
    });
  });
});
