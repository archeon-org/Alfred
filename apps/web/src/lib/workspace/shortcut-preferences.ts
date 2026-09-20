import {
  SHORTCUT_ACTIONS,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutOverrides,
} from './keyboard-shortcuts';

export interface ShortcutPreferences {
  readonly version: 1;
  readonly bindings: ShortcutOverrides;
}

export const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferences = { version: 1, bindings: {} };

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,31}$/u;
const LABEL_MAX_LENGTH = 16;

function decodeBinding(value: unknown): ShortcutBinding | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.code !== 'string' ||
    !CODE_PATTERN.test(record.code) ||
    typeof record.shift !== 'boolean' ||
    typeof record.label !== 'string' ||
    record.label.length === 0 ||
    record.label.length > LABEL_MAX_LENGTH
  )
    return null;
  return { code: record.code, shift: record.shift, label: record.label };
}

/** Only bounded, well-formed bindings for known actions become app state. */
export function decodeShortcutPreferences(value: unknown): ShortcutPreferences {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1)
    return DEFAULT_SHORTCUT_PREFERENCES;
  const record = value as Record<string, unknown>;
  const raw =
    typeof record.bindings === 'object' && record.bindings !== null
      ? (record.bindings as Record<string, unknown>)
      : {};
  const bindings: Partial<Record<ShortcutAction, ShortcutBinding>> = {};
  for (const action of SHORTCUT_ACTIONS) {
    const binding = decodeBinding(raw[action]);
    if (binding !== null) bindings[action] = binding;
  }
  return { version: 1, bindings };
}
