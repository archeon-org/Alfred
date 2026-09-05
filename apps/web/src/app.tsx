import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import { SessionProvider } from './auth/session-provider';
import { FeatureFlagsProvider } from './features/feature-flags-provider';
import { appRouter } from './routes/app-router';

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <FeatureFlagsProvider>
        <SessionProvider>
          <RouterProvider router={appRouter} />
        </SessionProvider>
      </FeatureFlagsProvider>
    </QueryClientProvider>
  );
}
