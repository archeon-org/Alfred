export type ShortcutAction =
  'newConversation' | 'toggleNavigation' | 'toggleContext' | 'showShortcuts';

/** One key with the platform modifier: the physical key, whether Shift is held, and its glyph. */
export interface ShortcutBinding {
  /** `KeyboardEvent.code`: the same key on AZERTY and QWERTY, whatever it prints. */
  readonly code: string;
  readonly shift: boolean;
  /** Glyph shown to people for that key, as their layout prints it. */
  readonly label: string;
}

export interface ShortcutDefinition {
  readonly action: ShortcutAction;
  readonly label: string;
  readonly defaultBinding: ShortcutBinding;
  /** The default works with or without Shift: `/` needs Shift on AZERTY and not on QWERTY. */
  readonly shiftOptional?: boolean;
}

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  'newConversation',
  'toggleNavigation',
  'toggleContext',
  'showShortcuts',
];

/**
 * Defaults: the platform modifier (⌘ on Apple, Ctrl elsewhere) plus a key that no major browser
 * reserves and that exists on both AZERTY and QWERTY. The two panel keys sit side by side like
 * the panels. People may rebind them in the settings within the same rules.
 */
export const WORKSPACE_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    action: 'newConversation',
    label: 'Nouvelle conversation',
    defaultBinding: { code: 'Space', shift: true, label: 'Espace' },
  },
  {
    action: 'toggleNavigation',
    label: 'Afficher ou masquer la navigation',
    defaultBinding: { code: 'Comma', shift: true, label: ',' },
  },
  {
    action: 'toggleContext',
    label: 'Afficher ou masquer le contexte',
    defaultBinding: { code: 'Period', shift: true, label: '.' },
  },
  {
    action: 'showShortcuts',
    label: 'Ouvrir les raccourcis clavier',
    defaultBinding: { code: 'Slash', shift: false, label: '/' },
    shiftOptional: true,
  },
];

const definitions = new Map(WORKSPACE_SHORTCUTS.map((item) => [item.action, item]));

export function shortcutDefinition(action: ShortcutAction): ShortcutDefinition {
  const definition = definitions.get(action);
  if (definition === undefined) throw new Error(`Unknown shortcut: ${action}`);
  return definition;
}

export type ShortcutOverrides = Partial<Record<ShortcutAction, ShortcutBinding>>;
export type ShortcutBindings = Readonly<Record<ShortcutAction, ShortcutBinding>>;

/** Effective bindings: a person's choice where one exists, the default elsewhere. */
export function resolveBindings(overrides: ShortcutOverrides = {}): ShortcutBindings {
  return Object.fromEntries(
    WORKSPACE_SHORTCUTS.map((definition) => [
      definition.action,
      overrides[definition.action] ?? definition.defaultBinding,
    ]),
  ) as ShortcutBindings;
}

export function isDefaultBinding(action: ShortcutAction, binding: ShortcutBinding): boolean {
  const { defaultBinding } = shortcutDefinition(action);
  return binding.code === defaultBinding.code && binding.shift === defaultBinding.shift;
}

/** ⌘ on macOS and iOS, Ctrl everywhere else; environments without a platform use Ctrl. */
export function isApplePlatform(
  nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator,
): boolean {
  return /Mac|iPhone|iPad|iPod/u.test(nav.platform || nav.userAgent);
}

export interface ShortcutKeyEvent {
  readonly code: string;
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
}

function hasPrimaryModifier(event: ShortcutKeyEvent, apple: boolean): boolean {
  return apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** Virtual keyboards and synthetic events may carry no physical code; the glyph is all there is. */
function hasPhysicalCode(event: Pick<ShortcutKeyEvent, 'code'>): boolean {
  return event.code !== '' && event.code !== 'Unknown' && event.code !== 'Unidentified';
}

function keyMatches(event: ShortcutKeyEvent, binding: ShortcutBinding): boolean {
  if (hasPhysicalCode(event)) return event.code === binding.code;
  return keyLabel(event) === binding.label;
}

/** The action a key event asks for, or null: the platform modifier alone, never Alt, never a repeat. */
export function matchShortcut(
  event: ShortcutKeyEvent,
  apple: boolean,
  bindings: ShortcutBindings = resolveBindings(),
): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return null;
  if (!hasPrimaryModifier(event, apple)) return null;
  for (const definition of WORKSPACE_SHORTCUTS) {
    const binding = bindings[definition.action];
    if (!keyMatches(event, binding)) continue;
    const shiftFree =
      definition.shiftOptional === true && isDefaultBinding(definition.action, binding);
    if (!shiftFree && event.shiftKey !== binding.shift) continue;
    return definition.action;
  }
  return null;
}

/** Human form of a binding: `⌘⇧,` on Apple platforms, `Ctrl+Maj+,` elsewhere. */
export function formatBinding(binding: ShortcutBinding, apple: boolean): string {
  if (apple) return `⌘${binding.shift ? '⇧' : ''}${binding.label}`;
  return ['Ctrl', ...(binding.shift ? ['Maj'] : []), binding.label].join('+');
}

/** `aria-keyshortcuts` value for the platform, e.g. `Meta+Shift+,` or `Control+Shift+,`. */
export function ariaKeyShortcuts(binding: ShortcutBinding, apple: boolean): string {
  const key = binding.code === 'Space' ? 'Space' : binding.label;
  return [apple ? 'Meta' : 'Control', ...(binding.shift ? ['Shift'] : []), key].join('+');
}

/** Attributes for a control that also answers to a shortcut: an ARIA hint and a title suffix. */
export function shortcutAttributes(
  binding: ShortcutBinding,
  label: string,
  apple: boolean,
): { readonly 'aria-keyshortcuts': string; readonly title: string } {
  return {
    'aria-keyshortcuts': ariaKeyShortcuts(binding, apple),
    title: `${label} (${formatBinding(binding, apple)})`,
  };
}

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'AltLeft',
  'AltRight',
  'CapsLock',
  'Fn',
  'OSLeft',
  'OSRight',
]);

/**
 * Keys that browsers, the operating system or text editing already take with the platform
 * modifier, with and without Shift. A binding on one of them would fight the browser.
 */
const RESERVED: Readonly<Record<string, { readonly plain?: string; readonly shift?: string }>> = {
  KeyA: { plain: 'tout sélectionner', shift: 'recherche d’onglets' },
  KeyB: { plain: 'favoris', shift: 'barre de favoris' },
  KeyC: { plain: 'copier', shift: 'inspecter la page' },
  KeyD: { plain: 'ajouter aux favoris', shift: 'ajouter tous les onglets aux favoris' },
  KeyE: { plain: 'recherche', shift: 'outils réseau' },
  KeyF: { plain: 'rechercher dans la page' },
  KeyG: { plain: 'occurrence suivante', shift: 'occurrence précédente' },
  KeyH: { plain: 'historique ou masquer la fenêtre', shift: 'historique' },
  KeyI: { plain: 'informations de la page', shift: 'outils de développement' },
  KeyJ: { plain: 'téléchargements', shift: 'téléchargements ou console' },
  KeyK: { plain: 'recherche', shift: 'console web' },
  KeyL: { plain: 'barre d’adresse', shift: 'barre latérale' },
  KeyM: { plain: 'réduire la fenêtre', shift: 'menu du profil' },
  KeyN: { plain: 'nouvelle fenêtre', shift: 'navigation privée' },
  KeyO: { plain: 'ouvrir un fichier', shift: 'gestionnaire de favoris' },
  KeyP: { plain: 'imprimer', shift: 'navigation privée' },
  KeyQ: { plain: 'quitter', shift: 'quitter' },
  KeyR: { plain: 'recharger', shift: 'recharger sans cache' },
  KeyS: { plain: 'enregistrer la page', shift: 'capture d’écran' },
  KeyT: { plain: 'nouvel onglet', shift: 'rouvrir l’onglet fermé' },
  KeyU: { plain: 'code source', shift: 'saisie Unicode' },
  KeyV: { plain: 'coller', shift: 'coller sans mise en forme' },
  KeyW: { plain: 'fermer l’onglet', shift: 'fermer la fenêtre' },
  KeyY: { plain: 'historique', shift: 'téléchargements' },
  KeyZ: { plain: 'annuler', shift: 'rétablir' },
  Digit0: { plain: 'zoom initial' },
  Digit1: { plain: 'changer d’onglet' },
  Digit2: { plain: 'changer d’onglet' },
  Digit3: { plain: 'changer d’onglet', shift: 'capture d’écran' },
  Digit4: { plain: 'changer d’onglet', shift: 'capture d’écran' },
  Digit5: { plain: 'changer d’onglet', shift: 'capture d’écran' },
  Digit6: { plain: 'changer d’onglet', shift: 'capture d’écran' },
  Digit7: { plain: 'changer d’onglet' },
  Digit8: { plain: 'changer d’onglet' },
  Digit9: { plain: 'dernier onglet' },
  Minus: { plain: 'zoom arrière', shift: 'zoom arrière' },
  Equal: { plain: 'zoom avant', shift: 'zoom avant' },
  BracketLeft: { plain: 'page précédente' },
  BracketRight: { plain: 'page suivante' },
  Comma: { plain: 'préférences' },
  Period: { plain: 'arrêter le chargement' },
  Space: { plain: 'recherche système ou méthode de saisie' },
  Tab: { plain: 'onglet suivant', shift: 'onglet précédent' },
  Backspace: { plain: 'suppression de texte', shift: 'suppression de texte' },
  Delete: { plain: 'suppression de texte', shift: 'suppression de texte' },
  Enter: { plain: 'envoi ou validation', shift: 'envoi ou validation' },
  Escape: { plain: 'annulation', shift: 'annulation' },
  ArrowLeft: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
  ArrowRight: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
  ArrowUp: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
  ArrowDown: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
  Home: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
  End: { plain: 'déplacement du curseur', shift: 'sélection de texte' },
};

/** Modifier keys alone never form a binding; a recorder waits for a real key. */
export function isModifierKey(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

export type BindingCheck =
  | { readonly ok: true; readonly binding: ShortcutBinding }
  | { readonly ok: false; readonly reason: string };

/** US glyphs for punctuation keys, shown when the layout reports a dead or unidentified key. */
const CODE_GLYPHS: Readonly<Record<string, string>> = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  IntlBackslash: '<',
  Minus: '-',
  Period: '.',
  Quote: '’',
  Semicolon: ';',
  Slash: '/',
};

/** Glyph for a key as the person's layout printed it, or its US glyph when the layout is silent. */
export function keyLabel(event: Pick<ShortcutKeyEvent, 'code' | 'key'>): string {
  if (event.code === 'Space' || event.key === ' ') return 'Espace';
  if (/^F\d{1,2}$/u.test(event.code)) return event.code;
  if (event.key.length === 1) return event.key.toLocaleUpperCase('fr');
  const digit = /^Digit(\d)$/u.exec(event.code);
  if (digit) return digit[1] ?? event.key;
  const letter = /^Key([A-Z])$/u.exec(event.code);
  if (letter) return letter[1] ?? event.key;
  return CODE_GLYPHS[event.code] ?? event.key;
}

/**
 * Whether a key event may become the binding of `action`: the platform modifier without Alt, a
 * real key, nothing the browser or text editing already uses, and nothing another action has.
 */
export function checkBinding(
  event: ShortcutKeyEvent,
  apple: boolean,
  action: ShortcutAction,
  bindings: ShortcutBindings,
): BindingCheck {
  if (MODIFIER_CODES.has(event.code)) {
    return { ok: false, reason: 'Appuyez sur une touche en plus du modificateur.' };
  }
  if (!hasPhysicalCode(event)) {
    return { ok: false, reason: 'Cette touche n’a pas été reconnue. Essayez une autre touche.' };
  }
  if (event.altKey) {
    return { ok: false, reason: `${apple ? 'Option' : 'Alt'} n’est pas pris en charge.` };
  }
  if (!hasPrimaryModifier(event, apple)) {
    return {
      ok: false,
      reason: `Le raccourci doit commencer par ${apple ? '⌘' : 'Ctrl'}.`,
    };
  }
  if (/^F\d{1,2}$/u.test(event.code)) {
    return { ok: false, reason: 'Les touches de fonction sont réservées au navigateur.' };
  }
  const reserved = RESERVED[event.code]?.[event.shiftKey ? 'shift' : 'plain'];
  if (reserved !== undefined) {
    return { ok: false, reason: `Réservé par le navigateur ou le système : ${reserved}.` };
  }
  const taken = WORKSPACE_SHORTCUTS.find(
    (definition) =>
      definition.action !== action &&
      bindings[definition.action].code === event.code &&
      bindings[definition.action].shift === event.shiftKey,
  );
  if (taken !== undefined) {
    return { ok: false, reason: `Déjà utilisé par « ${taken.label} ».` };
  }
  return {
    ok: true,
    binding: { code: event.code, shift: event.shiftKey, label: keyLabel(event) },
  };
}
