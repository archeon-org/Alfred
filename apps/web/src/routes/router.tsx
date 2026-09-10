import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';

import { SkillEditorScreen } from '@/screens/workspace/skill-editor-screen';
import { SkillsLayout } from '@/screens/workspace/skills-layout';
import { SkillsScreen } from '@/screens/workspace/skills-screen';
import { SettingsScreen } from '@/screens/workspace/settings-screen';
import { RequireSession } from '@/routes/guards/require-session';
import { RouteFocusManager } from '@/routes/route-focus-manager';
import { LoginScreen } from '@/screens/auth/login-screen';
import { OauthCallbackScreen } from '@/screens/auth/oauth-callback-screen';
import { NotFoundScreen } from '@/screens/errors/not-found-screen';
import { ConversationScreen } from '@/screens/workspace/conversation-screen';
import { ProjectScreen } from '@/screens/workspace/project-screen';
import { WorkspaceHomeScreen } from '@/screens/workspace/workspace-home-screen';
import { WorkspaceScreen } from '@/screens/workspace/workspace-screen';

export const routes: RouteObject[] = [
  {
    children: [
      { element: <LoginScreen />, path: '/' },
      { element: <LoginScreen />, path: '/login' },
      { element: <OauthCallbackScreen />, path: '/auth/callback' },
      {
        children: [
          {
            children: [
              { element: <WorkspaceHomeScreen />, index: true },
              { element: <SettingsScreen />, path: 'settings' },
              {
                element: <SkillsLayout />,
                path: 'skills',
                children: [
                  { element: <SkillsScreen />, index: true },
                  { element: <SkillEditorScreen />, path: 'new' },
                  { element: <SkillEditorScreen />, path: ':skillId/edit' },
                ],
              },
              { element: <ProjectScreen />, path: 'projects/:projectId' },
              { element: <ConversationScreen />, path: 'conversations/:conversationId' },
            ],
            element: <WorkspaceScreen />,
            path: '/app',
          },
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
