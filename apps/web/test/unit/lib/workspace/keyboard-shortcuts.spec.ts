import { describe, expect, it } from 'vitest';

import {
  ariaKeyShortcuts,
  checkBinding,
  formatBinding,
  isApplePlatform,
  isDefaultBinding,
  keyLabel,
  matchShortcut,
  resolveBindings,
  shortcutAttributes,
  WORKSPACE_SHORTCUTS,
} from '@/lib/workspace/keyboard-shortcuts';

const press = (overrides: Partial<Parameters<typeof matchShortcut>[0]> & { code: string }) => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe('workspace keyboard shortcuts', () => {
  it('uses the platform modifier only: ⌘ on Apple, Ctrl elsewhere, never both, never Alt', () => {
    const period = { code: 'Period', shiftKey: true };
    expect(matchShortcut(press({ ...period, metaKey: true }), true)).toBe('toggleContext');
    expect(matchShortcut(press({ ...period, ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(press({ ...period, ctrlKey: true }), false)).toBe('toggleContext');
    expect(matchShortcut(press({ ...period, metaKey: true }), false)).toBeNull();
    expect(matchShortcut(press({ ...period, ctrlKey: true, metaKey: true }), false)).toBeNull();
    expect(matchShortcut(press({ ...period, ctrlKey: true, altKey: true }), false)).toBeNull();
  });

  it('matches the physical key so AZERTY and QWERTY share the same gesture', () => {
    // On AZERTY the Comma key prints "?" with Shift; the code is what identifies it.
    expect(
      matchShortcut(press({ code: 'Comma', key: '?', ctrlKey: true, shiftKey: true }), false),
    ).toBe('toggleNavigation');
    expect(
      matchShortcut(press({ code: 'Space', key: ' ', ctrlKey: true, shiftKey: true }), false),
    ).toBe('newConversation');
    // "/" needs Shift on AZERTY and not on QWERTY: both are accepted by default.
    expect(matchShortcut(press({ code: 'Slash', key: '/', metaKey: true }), true)).toBe(
      'showShortcuts',
    );
    expect(
      matchShortcut(press({ code: 'Slash', key: '/', metaKey: true, shiftKey: true }), true),
    ).toBe('showShortcuts');
  });

  it('requires Shift for the panel and conversation shortcuts and ignores repeats, IME and used events', () => {
    expect(matchShortcut(press({ code: 'Comma', ctrlKey: true }), false)).toBeNull();
    expect(matchShortcut(press({ code: 'Space', ctrlKey: true }), false)).toBeNull();
    const valid = { code: 'Period', ctrlKey: true, shiftKey: true };
    expect(matchShortcut(press({ ...valid, repeat: true }), false)).toBeNull();
    expect(matchShortcut(press({ ...valid, isComposing: true }), false)).toBeNull();
    expect(matchShortcut(press({ ...valid, defaultPrevented: true }), false)).toBeNull();
    expect(matchShortcut(press({ code: 'KeyN', ctrlKey: true, shiftKey: true }), false)).toBeNull();
  });

  it('follows personal bindings exactly, Shift included, and frees the default key', () => {
    const custom = { code: 'Semicolon', shift: false, label: ';' };
    const bindings = resolveBindings({ toggleContext: custom });
    expect(bindings.toggleContext).toEqual(custom);
    expect(bindings.toggleNavigation).toEqual(WORKSPACE_SHORTCUTS[1]!.defaultBinding);
    expect(matchShortcut(press({ code: 'Semicolon', ctrlKey: true }), false, bindings)).toBe(
      'toggleContext',
    );
    expect(
      matchShortcut(press({ code: 'Semicolon', ctrlKey: true, shiftKey: true }), false, bindings),
    ).toBeNull();
    expect(
      matchShortcut(press({ code: 'Period', ctrlKey: true, shiftKey: true }), false, bindings),
    ).toBeNull();
    // A rebound "/" no longer accepts both Shift states: the leniency belongs to the default.
    const slash = resolveBindings({ showShortcuts: { code: 'Slash', shift: true, label: '/' } });
    expect(matchShortcut(press({ code: 'Slash', ctrlKey: true }), false, slash)).toBeNull();
    expect(isDefaultBinding('toggleContext', custom)).toBe(false);
    expect(isDefaultBinding('toggleContext', { code: 'Period', shift: true, label: ':' })).toBe(
      true,
    );
  });

  it('describes every shortcut in the platform notation for people and assistive technology', () => {
    const defaults = WORKSPACE_SHORTCUTS.map((shortcut) => shortcut.defaultBinding);
    expect(defaults.map((binding) => formatBinding(binding, true))).toEqual([
      '⌘⇧Espace',
      '⌘⇧,',
      '⌘⇧.',
      '⌘/',
    ]);
    expect(defaults.map((binding) => formatBinding(binding, false))).toEqual([
      'Ctrl+Maj+Espace',
      'Ctrl+Maj+,',
      'Ctrl+Maj+.',
      'Ctrl+/',
    ]);
    expect(ariaKeyShortcuts(defaults[1]!, true)).toBe('Meta+Shift+,');
    expect(ariaKeyShortcuts(defaults[3]!, false)).toBe('Control+/');
    expect(shortcutAttributes(defaults[2]!, 'Masquer le contexte', false)).toEqual({
      'aria-keyshortcuts': 'Control+Shift+.',
      title: 'Masquer le contexte (Ctrl+Maj+.)',
    });
  });

  it('accepts a free key with the platform modifier and labels it as the layout prints it', () => {
    const bindings = resolveBindings();
    const semicolon = press({ code: 'Semicolon', key: 'm', ctrlKey: true });
    expect(checkBinding(semicolon, false, 'toggleContext', bindings)).toEqual({
      ok: true,
      binding: { code: 'Semicolon', shift: false, label: 'M' },
    });
    const quote = press({ code: 'Quote', key: '%', metaKey: true, shiftKey: true });
    expect(checkBinding(quote, true, 'newConversation', bindings)).toEqual({
      ok: true,
      binding: { code: 'Quote', shift: true, label: '%' },
    });
    expect(keyLabel({ code: 'Space', key: ' ' })).toBe('Espace');
    expect(keyLabel({ code: 'Digit5', key: 'Dead' })).toBe('5');
    expect(keyLabel({ code: 'KeyQ', key: 'Unidentified' })).toBe('Q');
    expect(keyLabel({ code: 'Semicolon', key: 'Dead' })).toBe(';');
    expect(keyLabel({ code: 'F7', key: 'F7' })).toBe('F7');
    expect(keyLabel({ code: 'NumpadAdd', key: 'NumpadAdd' })).toBe('NumpadAdd');
  });

  it('falls back to the printed glyph when the event carries no physical code', () => {
    // Virtual keyboards and synthetic events report "Unknown" or "" as the code.
    expect(
      matchShortcut(press({ code: 'Unknown', key: ',', ctrlKey: true, shiftKey: true }), false),
    ).toBe('toggleNavigation');
    expect(matchShortcut(press({ code: '', key: ' ', ctrlKey: true, shiftKey: true }), false)).toBe(
      'newConversation',
    );
    const custom = resolveBindings({
      toggleContext: { code: 'Semicolon', shift: false, label: 'M' },
    });
    expect(matchShortcut(press({ code: 'Unknown', key: 'm', ctrlKey: true }), false, custom)).toBe(
      'toggleContext',
    );
    // A physical code wins over the glyph: Ctrl+M on QWERTY does not fire the AZERTY ";" binding.
    expect(
      matchShortcut(press({ code: 'KeyM', key: 'm', ctrlKey: true }), false, custom),
    ).toBeNull();
    expect(
      checkBinding(
        press({ code: 'Unknown', key: 'm', ctrlKey: true }),
        false,
        'toggleContext',
        custom,
      ),
    ).toEqual({
      ok: false,
      reason: 'Cette touche n’a pas été reconnue. Essayez une autre touche.',
    });
  });

  it('refuses modifiers alone, Alt, the wrong modifier, function keys and browser-reserved keys', () => {
    const bindings = resolveBindings();
    const check = (event: Parameters<typeof matchShortcut>[0], apple = false) =>
      checkBinding(event, apple, 'toggleContext', bindings);
    expect(
      check(press({ code: 'ShiftLeft', key: 'Shift', ctrlKey: true, shiftKey: true })),
    ).toEqual({ ok: false, reason: 'Appuyez sur une touche en plus du modificateur.' });
    expect(check(press({ code: 'KeyX', key: 'x', ctrlKey: true, altKey: true }))).toEqual({
      ok: false,
      reason: 'Alt n’est pas pris en charge.',
    });
    expect(check(press({ code: 'KeyX', key: 'x', ctrlKey: true, altKey: true }), true)).toEqual({
      ok: false,
      reason: 'Option n’est pas pris en charge.',
    });
    expect(check(press({ code: 'Semicolon', key: ';', shiftKey: true }))).toEqual({
      ok: false,
      reason: 'Le raccourci doit commencer par Ctrl.',
    });
    expect(check(press({ code: 'Semicolon', key: ';', ctrlKey: true }), true)).toEqual({
      ok: false,
      reason: 'Le raccourci doit commencer par ⌘.',
    });
    expect(check(press({ code: 'F5', key: 'F5', ctrlKey: true }))).toEqual({
      ok: false,
      reason: 'Les touches de fonction sont réservées au navigateur.',
    });
    expect(check(press({ code: 'KeyT', key: 't', ctrlKey: true }))).toEqual({
      ok: false,
      reason: 'Réservé par le navigateur ou le système : nouvel onglet.',
    });
    expect(check(press({ code: 'KeyT', key: 'T', ctrlKey: true, shiftKey: true }))).toEqual({
      ok: false,
      reason: 'Réservé par le navigateur ou le système : rouvrir l’onglet fermé.',
    });
    expect(check(press({ code: 'Comma', key: ',', metaKey: true }), true)).toEqual({
      ok: false,
      reason: 'Réservé par le navigateur ou le système : préférences.',
    });
    // Shift frees a key whose plain form is reserved but whose shifted form is not.
    expect(check(press({ code: 'KeyF', key: 'F', ctrlKey: true, shiftKey: true })).ok).toBe(true);
  });

  it('refuses a key another action already holds, on the same action it is a no-op change', () => {
    const bindings = resolveBindings();
    const comma = press({ code: 'Comma', key: ',', ctrlKey: true, shiftKey: true });
    expect(checkBinding(comma, false, 'toggleContext', bindings)).toEqual({
      ok: false,
      reason: 'Déjà utilisé par « Afficher ou masquer la navigation ».',
    });
    expect(checkBinding(comma, false, 'toggleNavigation', bindings).ok).toBe(true);
  });

  it('detects Apple platforms from the platform string, falling back to the user agent', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(
      isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS)' }),
    ).toBe(true);
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(
      false,
    );
    expect(isApplePlatform({ platform: '', userAgent: '' })).toBe(false);
  });
});
