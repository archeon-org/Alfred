import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { CallbackPage } from '../auth/callback-page';
import { LoginPage } from '../auth/login-page';
import { AppLayout } from '../shell/app-layout';
import { NotFoundPage } from './not-found-page';
import { RequireSession } from './require-session';
import { RouteFocusManager } from './route-focus-manager';

export const routes: RouteObject[] = [
  {
    children: [
      { element: <LoginPage />, path: '/' },
      { element: <LoginPage />, path: '/login' },
      { element: <CallbackPage />, path: '/auth/callback' },
      {
        children: [
          { element: <AppLayout />, path: '/app' },
          { element: <Navigate replace to="/app" />, path: '/workspace' },
        ],
        element: <RequireSession />,
      },
      { element: <NotFoundPage />, path: '*' },
    ],
    element: <RouteFocusManager />,
  },
];

export const appRouter = createBrowserRouter(routes);
