import type { ExecutionSnapshot } from '@alfred/contracts';

import type { LiveTurn } from '@/contexts/chat-session/chat-session-context';
import type { HandoverContext } from '@/contexts/chat-session/transcript-handover';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import type { AttachmentView } from '@/lib/files/composer-attachments';
import { createExecution } from '@/services/executions/executions.service';

interface AttachmentSource {
  readonly attachments?: readonly AttachmentView[] | undefined;
}

/**
 * The files of the user turn as a turn patch. The composer names them at once; the API's own
 * account (a snapshot, the AG-UI run state) replaces them as soon as it arrives, and an older API
 * that says nothing leaves them as they are.
 */
export function namedAttachments(source: AttachmentSource): Pick<LiveTurn, 'attachments'> {
  return source.attachments === undefined ? {} : { attachments: source.attachments };
}

/**
 * Submits the user turn with the files the composer attached. Once the API holds it, the library
 * lists are read again: each file counts one more message and « Cette conversation » lists it.
 */
export async function submitTurn(
  run: HandoverContext & AttachmentSource,
  text: string,
  submissionId: string,
): Promise<ExecutionSnapshot> {
  const attachmentIds = (run.attachments ?? []).map(({ fileId }) => fileId);
  const snapshot = await createExecution(
    run.client,
    run.conversationId,
    text,
    submissionId,
    run.controller.signal,
    attachmentIds,
  );
  if (attachmentIds.length > 0)
    void run.queryClient.invalidateQueries({ queryKey: fileKeys.lists(run.userId) });
  return snapshot;
}
