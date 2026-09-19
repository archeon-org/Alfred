import {
  EXECUTION_OUTPUT_MAX_LENGTH,
  type ExecutionActivity,
  type ExecutionSnapshot,
} from '@alfred/contracts';

/**
 * Buffers of the answer as AG-UI delivers it. Stream deltas are relative to what the stream sent
 * for the open message, while a JSON read (create, Stop, reconciliation) may run ahead of a slow
 * stream. Both texts are prefixes of the same answer, so the longer one is the more recent.
 */
export class LiveAnswer {
  messageId: string | null = null;
  activities: readonly ExecutionActivity[] = [];
  /** True once the stream delivered content newer than any JSON read. */
  streamed = false;
  private messageText = '';
  private readText = '';

  get text(): string {
    return this.messageText.length >= this.readText.length ? this.messageText : this.readText;
  }

  /**
   * A new attach re-synthesizes the run from durable state, which is at least as new as any
   * earlier read: start from empty buffers, including the read text.
   */
  reset(): void {
    this.messageId = null;
    this.messageText = '';
    this.readText = '';
    this.activities = [];
  }

  /** Opens a message; true when a different message replaces the visible answer. */
  start(messageId: string): boolean {
    const replaced = this.messageId !== null && this.messageId !== messageId;
    if (replaced) this.readText = '';
    this.messageId = messageId;
    this.messageText = '';
    this.streamed = true;
    return replaced;
  }

  /**
   * False when the delta does not belong to the open message or would take the answer past the
   * bounded length of the JSON profile; the observer then fails closed instead of growing memory.
   */
  append(messageId: string, delta: string): boolean {
    if (messageId !== this.messageId) return false;
    if (this.messageText.length + delta.length > EXECUTION_OUTPUT_MAX_LENGTH) return false;
    this.messageText += delta;
    return true;
  }

  /** True when the tool call is new to this answer. */
  toolStart(id: string, label: string): boolean {
    this.streamed = true;
    if (this.activities.some((activity) => activity.id === id)) return false;
    this.activities = [...this.activities, { id, label, status: 'running' }];
    return true;
  }

  toolResult(id: string, content: string): void {
    this.activities = this.activities.map((activity) =>
      activity.id === id
        ? { ...activity, status: content === 'failed' ? 'failed' : 'completed' }
        : activity,
    );
  }

  extends(text: string): boolean {
    return text.startsWith(this.text);
  }

  /**
   * Takes the content of a JSON read when it is authoritative (settled) or continues what the
   * stream already showed; returns false when the streamed content stays ahead.
   */
  read(snapshot: ExecutionSnapshot, settled: boolean): boolean {
    if (this.streamed && !settled && !this.extends(snapshot.assistantText)) return false;
    this.streamed = false;
    this.readText = snapshot.assistantText;
    this.activities = snapshot.activities;
    if (settled) {
      this.messageId = null;
      this.messageText = '';
    }
    return true;
  }
}
