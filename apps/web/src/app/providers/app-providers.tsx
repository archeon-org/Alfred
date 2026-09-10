import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';

import { createAppQueryClient } from '@/app/query-client';
import { useAppearanceEffects } from '@/hooks/workspace/use-appearance-effects';
import { SessionProvider } from '@/contexts/session/session-provider';

export function AppProviders({ children }: PropsWithChildren) {
  useAppearanceEffects();
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
