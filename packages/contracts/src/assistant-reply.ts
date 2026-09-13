/**
 * Assembles the assistant's visible answer from native LangGraph stream events. The API uses it to
 * persist the final turn and the browser uses the same rules to render the live answer, so both
 * sides agree on what "the reply" is.
 *
 * Supported event shapes:
 * - `messages/metadata`: `{ [messageId]: { metadata } }` announcing where a message comes from.
 *   Messages produced by non-generation model calls (middleware guards, classifiers) are excluded
 *   from the reply: they carry the `non-generation` / `guard` tags or come from a middleware hook
 *   node such as `PromptInjectionGuardMiddleware.before_agent`.
 * - `messages/partial` and `messages/complete` (stream mode `messages`): arrays of messages whose
 *   content is cumulative.
 * - `messages` (stream mode `messages-tuple`): `[chunk, metadata]` where chunk content is a delta.
 * - `values` (stream mode `values`): a state snapshot with a `messages` array.
 */
export interface AssistantReply {
  observe(event: string, data: unknown): void;
  /** Text of the AI message most recently touched by the stream; empty until one appears. */
  readonly text: string;
}

interface RuntimeMessage {
  readonly id: string;
  readonly type: string;
  readonly content: unknown;
}

const AI_MESSAGE_TYPES = new Set(['ai', 'AIMessageChunk']);
const NON_GENERATION_TAGS = new Set(['non-generation', 'non_generation', 'guard']);
const MIDDLEWARE_HOOK_NODE = /\.(?:before|after)_(?:agent|model)$/u;

export function createAssistantReply(): AssistantReply {
  const texts = new Map<string, string>();
  const excluded = new Set<string>();
  let lastId: string | null = null;

  const remember = (message: RuntimeMessage, text: string) => {
    if (excluded.has(message.id)) return;
    texts.set(message.id, text);
    lastId = message.id;
  };

  const exclude = (id: string) => {
    excluded.add(id);
    texts.delete(id);
    if (lastId === id) lastId = [...texts.keys()].at(-1) ?? null;
  };

  return {
    observe(event, data) {
      switch (event) {
        case 'messages/metadata':
          for (const [id, entry] of metadataEntries(data)) {
            if (isNonGeneration(entry)) exclude(id);
          }
          return;
        case 'messages/partial':
        case 'messages/complete':
          for (const message of aiMessages(data)) {
            const text = contentText(message.content);
            if (text.length > 0) remember(message, text);
          }
          return;
        case 'messages': {
          if (!Array.isArray(data)) return;
          const [chunk, metadata] = data as unknown[];
          const message = asAiMessage(chunk);
          if (message === null) return;
          if (isNonGeneration(metadata)) {
            exclude(message.id);
            return;
          }
          const delta = contentText(message.content);
          if (delta.length > 0) remember(message, (texts.get(message.id) ?? '') + delta);
          return;
        }
        case 'values': {
          if (typeof data !== 'object' || data === null) return;
          const messages = aiMessages((data as { readonly messages?: unknown }).messages);
          const last = messages.findLast((message) => !excluded.has(message.id));
          if (last === undefined) return;
          const text = contentText(last.content);
          if (text.length > 0) remember(last, text);
          return;
        }
        default:
          return;
      }
    },
    get text() {
      return lastId === null ? '' : (texts.get(lastId) ?? '');
    },
  };
}

function metadataEntries(data: unknown): [string, unknown][] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>);
}

/** True when the message metadata marks a model call that does not produce the answer. */
function isNonGeneration(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const wrapped = (entry as { readonly metadata?: unknown }).metadata;
  const metadata = (typeof wrapped === 'object' && wrapped !== null ? wrapped : entry) as {
    readonly tags?: unknown;
    readonly langgraph_node?: unknown;
  };
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  if (tags.some((tag) => typeof tag === 'string' && NON_GENERATION_TAGS.has(tag))) return true;
  return (
    typeof metadata.langgraph_node === 'string' &&
    MIDDLEWARE_HOOK_NODE.test(metadata.langgraph_node)
  );
}

function aiMessages(value: unknown): RuntimeMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const message = asAiMessage(item);
    return message === null ? [] : [message];
  });
}

function asAiMessage(value: unknown): RuntimeMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, type, content } = value as Partial<RuntimeMessage>;
  if (typeof id !== 'string' || typeof type !== 'string' || !AI_MESSAGE_TYPES.has(type)) {
    return null;
  }
  return { content, id, type };
}

/** Text of a LangChain message content: a string, or the `text` blocks of a content array. */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (typeof block !== 'object' || block === null) return '';
      const { type, text } = block as { readonly type?: unknown; readonly text?: unknown };
      return type === 'text' && typeof text === 'string' ? text : '';
    })
    .join('');
}
