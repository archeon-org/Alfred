import type { StoredFile } from '@alfred/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { fileError } from '@/lib/files/file-errors';
import { getFile } from '@/services/files/files.service';
import { ApiRequestError } from '@/services/http/api-json';

/** The application does not poll (ADR 0023); analysis of a file is the bounded exception. */
export const READINESS_POLL_MS = 2_000;
/** About one minute of reads per mounted row or chip; a window focus reads again afterwards. */
export const READINESS_MAX_POLLS = 30;

const isGone = (error: unknown) => error instanceof ApiRequestError && error.status === 404;

interface FileReadinessOptions {
  /** What the list or the upload answer already said; absent for an id handed over by the router. */
  readonly known?: StoredFile;
  /** Only a file still `processing` is watched. */
  readonly enabled: boolean;
  /** The file left `processing`. */
  readonly onSettled?: (file: StoredFile) => void;
  /** The API no longer serves the file (deleted elsewhere). */
  readonly onUnavailable?: (error: string) => void;
}

/**
 * Follows one file while it is being analysed: a read every two seconds, thirty at most, and
 * only while the row or chip that asked is mounted. Once the file is ready or failed the reads
 * stop and the library lists are refreshed, so filters by state stay true.
 */
export function useFileReadiness(
  fileId: string,
  { known, enabled, onSettled, onUnavailable }: FileReadinessOptions,
): StoredFile | undefined {
  const { client, userId } = useWorkspaceAccount();
  const queryClient = useQueryClient();
  const polls = useRef(0);
  const query = useQuery({
    queryKey: fileKeys.detail(userId, fileId),
    queryFn: ({ signal }) => {
      polls.current += 1;
      return getFile(client, fileId, signal);
    },
    enabled,
    ...(known === undefined ? {} : { initialData: known }),
    // Initial data counts as just received: the first read comes with the interval, not at once.
    staleTime: READINESS_POLL_MS,
    // A failed read is retried with the next tick, within the same budget; a 404 ends the wait.
    refetchInterval: (current) =>
      current.state.data?.readiness === 'processing' &&
      !isGone(current.state.error) &&
      polls.current < READINESS_MAX_POLLS
        ? READINESS_POLL_MS
        : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { data, error } = query;
  const settled = data !== undefined && data.readiness !== 'processing' ? data : undefined;
  const callbacks = useRef({ onSettled, onUnavailable });
  useEffect(() => {
    callbacks.current = { onSettled, onUnavailable };
  });
  useEffect(() => {
    if (!enabled || settled === undefined) return;
    callbacks.current.onSettled?.(settled);
    void queryClient.invalidateQueries({ queryKey: fileKeys.lists(userId) });
  }, [enabled, queryClient, settled, userId]);
  // A file deleted elsewhere answers 404: the wait ends, whatever was known before. Any other
  // failure only matters when nothing at all is known about the file.
  const unavailable =
    enabled && error !== null && (isGone(error) || data === undefined) ? error : null;
  useEffect(() => {
    if (unavailable === null) return;
    callbacks.current.onUnavailable?.(fileError(unavailable, 'Ce fichier n’est plus disponible.'));
    void queryClient.invalidateQueries({ queryKey: fileKeys.lists(userId) });
  }, [queryClient, unavailable, userId]);
  return data;
}
