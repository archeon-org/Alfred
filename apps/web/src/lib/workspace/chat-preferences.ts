/** A named combination of display switches. */
export type ChatPreset = 'simple' | 'standard' | 'detailed';
/** The preset in use, or `custom` once the switches no longer match one. */
export type ChatDetail = ChatPreset | 'custom';

/** Every display switch of the chat. Alfred is the orchestrator; specialists work beneath it. */
export interface ChatDisplay {
  /** The work log stays open while Alfred works; otherwise one line names the current activity. */
  readonly openWhileWorking: boolean;
  /** A reasoning opens while it is being written; otherwise it stays folded on its latest line. */
  readonly openReasoningWhileStreaming: boolean;
  /** The work log folds itself once the answer is complete. */
  readonly foldWhenDone: boolean;
  readonly orchestratorReasoning: boolean;
  /** Alfred's intermediate messages between two actions. */
  readonly orchestratorMessages: boolean;
  readonly orchestratorTools: boolean;
  /** Model round trips that produced nothing. */
  readonly emptyGenerations: boolean;
  readonly specialistReasoning: boolean;
  readonly specialistMessages: boolean;
  readonly specialistTools: boolean;
}

export interface ChatPreferences extends ChatDisplay {
  readonly version: 2;
  readonly detail: ChatDetail;
}

export const CHAT_DISPLAY_KEYS = [
  'openWhileWorking',
  'openReasoningWhileStreaming',
  'foldWhenDone',
  'orchestratorReasoning',
  'orchestratorMessages',
  'orchestratorTools',
  'emptyGenerations',
  'specialistReasoning',
  'specialistMessages',
  'specialistTools',
] as const satisfies readonly (keyof ChatDisplay)[];

export type ChatDisplayKey = (typeof CHAT_DISPLAY_KEYS)[number];

export const CHAT_PRESETS: Readonly<Record<ChatPreset, ChatDisplay>> = {
  /** One activity line while Alfred works; unfolded, only the specialists called. */
  simple: {
    openWhileWorking: false,
    openReasoningWhileStreaming: false,
    foldWhenDone: true,
    orchestratorReasoning: false,
    orchestratorMessages: false,
    orchestratorTools: false,
    emptyGenerations: false,
    specialistReasoning: false,
    specialistMessages: false,
    specialistTools: false,
  },
  /** Alfred's reasoning, messages and tools, and the specialists' messages and tools. */
  standard: {
    openWhileWorking: true,
    openReasoningWhileStreaming: false,
    foldWhenDone: true,
    orchestratorReasoning: true,
    orchestratorMessages: true,
    orchestratorTools: true,
    emptyGenerations: false,
    specialistReasoning: false,
    specialistMessages: true,
    specialistTools: true,
  },
  /** Everything, with reasoning open while it is being written. */
  detailed: {
    openWhileWorking: true,
    openReasoningWhileStreaming: true,
    foldWhenDone: true,
    orchestratorReasoning: true,
    orchestratorMessages: true,
    orchestratorTools: true,
    emptyGenerations: true,
    specialistReasoning: true,
    specialistMessages: true,
    specialistTools: true,
  },
};

const PRESETS: readonly ChatPreset[] = ['simple', 'standard', 'detailed'];

export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  version: 2,
  detail: 'standard',
  ...CHAT_PRESETS.standard,
};

/** The preset whose switches are exactly these, or `custom`. */
export function presetOf(display: ChatDisplay): ChatDetail {
  return (
    PRESETS.find((preset) =>
      CHAT_DISPLAY_KEYS.every((key) => CHAT_PRESETS[preset][key] === display[key]),
    ) ?? 'custom'
  );
}

/** Choosing a preset sets all of its switches. */
export function applyPreset(preset: ChatPreset): ChatPreferences {
  return { version: 2, detail: preset, ...CHAT_PRESETS[preset] };
}

/** Changing one switch keeps the others; the detail follows the combination it now forms. */
export function withSwitch(
  previous: ChatPreferences,
  key: ChatDisplayKey,
  value: boolean,
): ChatPreferences {
  const next = { ...previous, [key]: value };
  return { ...next, detail: presetOf(next) };
}

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Version 1 had one detail level and switches shared by Alfred and its specialists. */
function fromVersion1(record: Record<string, unknown>): ChatPreferences {
  const detail = PRESETS.find((preset) => preset === record.detail) ?? 'standard';
  const reasoning = flag(record.showReasoning, true);
  const messages = flag(record.showNarration, true);
  const display: ChatDisplay = {
    openWhileWorking: detail !== 'simple',
    openReasoningWhileStreaming: detail === 'detailed',
    foldWhenDone: flag(record.foldWhenDone, true),
    orchestratorReasoning: reasoning,
    orchestratorMessages: messages,
    orchestratorTools: true,
    emptyGenerations: flag(record.showEmptyGenerations, true),
    specialistReasoning: reasoning,
    specialistMessages: messages,
    specialistTools: true,
  };
  return { version: 2, ...display, detail: presetOf(display) };
}

/** Only bounded display choices become app state; anything else falls back to the defaults. */
export function decodeChatPreferences(value: unknown): ChatPreferences {
  if (typeof value !== 'object' || value === null || !('version' in value))
    return DEFAULT_CHAT_PREFERENCES;
  const record = value as Record<string, unknown>;
  if (record.version === 1) return fromVersion1(record);
  if (record.version !== 2) return DEFAULT_CHAT_PREFERENCES;
  const preset = PRESETS.find((candidate) => candidate === record.detail);
  const base = CHAT_PRESETS[preset ?? 'standard'];
  const display = Object.fromEntries(
    CHAT_DISPLAY_KEYS.map((key) => [key, flag(record[key], base[key])]),
  ) as unknown as ChatDisplay;
  // A stored `custom` stays custom; a named preset holds only while its switches still match.
  const detail = record.detail === 'custom' ? 'custom' : presetOf(display);
  return { version: 2, detail, ...display };
}
