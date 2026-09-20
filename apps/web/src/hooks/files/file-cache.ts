import type { QueryClient } from '@tanstack/react-query';

import { fileKeys } from '@/hooks/workspace/workspace-keys';

/**
 * After the library changed: its lists, the quota and the folder counts are read again. Previews
 * and single files are left alone, so no image is downloaded twice for a rename.
 */
export async function refreshFileLibrary(queryClient: QueryClient, userId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: fileKeys.lists(userId) }),
    queryClient.invalidateQueries({ queryKey: fileKeys.quota(userId) }),
    queryClient.invalidateQueries({ queryKey: fileKeys.folders(userId) }),
  ]);
}
