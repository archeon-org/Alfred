import type { Message } from '@alfred/contracts';

import type { LiveSession } from '@/contexts/chat-session/chat-session-context';

export type TranscriptEntry =
  | { readonly kind: 'message'; readonly message: Message }
  | { readonly kind: 'session'; readonly session: LiveSession };

/** Keep retained answers in their place even if a later answer reaches history first. */
export function transcriptEntries(
  messages: readonly Message[],
  sessions: readonly LiveSession[],
): readonly TranscriptEntry[] {
  let entries: readonly TranscriptEntry[] = messages.map((message) => ({
    kind: 'message',
    message,
  }));
  let previous = -1;
  for (const session of sessions) {
    const createdAt = session.turn.execution?.createdAt ?? session.createdAt;
    const next = entries.findIndex(
      (entry) => entry.kind === 'message' && entry.message.createdAt > createdAt,
    );
    const index = Math.max(previous + 1, next === -1 ? entries.length : next);
    entries = [...entries.slice(0, index), { kind: 'session', session }, ...entries.slice(index)];
    previous = index;
  }
  return entries;
}
