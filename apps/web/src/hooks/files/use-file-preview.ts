import { useQuery } from '@tanstack/react-query';

import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { getFilePreview } from '@/services/files/files.service';

/**
 * The reduced copy of a ready image, as bytes. They come through the HTTP client because an
 * `<img src="/api/…">` would carry no bearer token; the thumbnail turns them into an object URL
 * for as long as it is mounted.
 */
export function useFilePreview(fileId: string, enabled: boolean): Blob | undefined {
  const { client, userId } = useWorkspaceAccount();
  const { data } = useQuery({
    queryKey: fileKeys.preview(userId, fileId),
    queryFn: ({ signal }) => getFilePreview(client, fileId, signal),
    enabled,
    // The bytes of a file never change, so neither does its preview.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return enabled ? data : undefined;
}
