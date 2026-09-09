import { DEFAULT_CONVERSATION_TITLE } from '@alfred/contracts';

export const CONVERSATION_TITLE_LIMIT = 72;

function isPrintable(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint > 0x1f && codePoint !== 0x7f;
}

/** Deterministic chat title from a first message: first non-empty line, cut on a word. */
export function deriveConversationTitle(
  text: string,
  fallback = DEFAULT_CONVERSATION_TITLE,
): string {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0) ?? '';
  const normalized = [...line].filter(isPrintable).join('').replaceAll(/\s+/gu, ' ').trim();
  if (normalized.length === 0) return fallback;
  if (normalized.length <= CONVERSATION_TITLE_LIMIT) return normalized;
  const cut = normalized.slice(0, CONVERSATION_TITLE_LIMIT - 1);
  const wordBoundary = cut.lastIndexOf(' ');
  return `${(wordBoundary > 24 ? cut.slice(0, wordBoundary) : cut).trimEnd()}…`;
}
