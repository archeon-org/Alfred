import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { RequireSession } from '@/routes/guards/require-session';
import { RouteFocusManager } from '@/routes/route-focus-manager';
import { LoginScreen } from '@/screens/auth/login-screen';
import { OauthCallbackScreen } from '@/screens/auth/oauth-callback-screen';
import { NotFoundScreen } from '@/screens/errors/not-found-screen';
import { WorkspaceScreen } from '@/screens/workspace/workspace-screen';

export const routes: RouteObject[] = [
  {
    children: [
      { element: <LoginScreen />, path: '/' },
      { element: <LoginScreen />, path: '/login' },
      { element: <OauthCallbackScreen />, path: '/auth/callback' },
      {
        children: [
          { element: <WorkspaceScreen />, path: '/app' },
          { element: <Navigate replace to="/app" />, path: '/workspace' },
        ],
        element: <RequireSession />,
      },
      { element: <NotFoundScreen />, path: '*' },
    ],
    element: <RouteFocusManager />,
  },
];

export const appRouter = createBrowserRouter(routes);
