import { useApiClient } from '@/hooks/api/use-api-client';
import { useSession } from '@/hooks/auth/use-session';

/** Authenticated client plus the account identifier that scopes every workspace query. */
export function useWorkspaceAccount() {
  const client = useApiClient();
  const { user } = useSession();
  if (user === null) throw new Error('Les données du workspace nécessitent une session.');
  return { client, userId: user.id };
}
