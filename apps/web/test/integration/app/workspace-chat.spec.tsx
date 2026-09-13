import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWorkspaceAt } from '../../support/render-workspace';
import {
  CONVERSATION_ID,
  conversation,
  createWorkspaceApi,
  fakeReply,
  fakeTitle,
  IMPLICIT_PROJECT_ID,
  PROJECT_ID,
  project,
  STANDALONE_CONVERSATION_ID,
} from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The chat panel is re-created when the route changes: query the current main element each time.
const findInMain = (text: string | RegExp) =>
  waitFor(() => within(screen.getByRole('main')).getByText(text));
const sidebar = () => within(screen.getByRole('complementary', { name: 'Espace personnel' }));

describe('Workspace chat with the agent bridge', () => {
  it('creates the chat from the home composer, streams the answer and titles the chat', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({ features: { agentRuntime: true } });
    const { router } = renderWorkspaceAt('/app', api);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'hello{Enter}');

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/app\/conversations\/[0-9a-f-]{36}$/u),
    );
    expect(router.state.location.state).toBeNull();
    expect(await findInMain('hello')).toBeVisible();
    expect(await findInMain(fakeReply('hello'))).toBeVisible();
    expect(await sidebar().findByRole('button', { name: fakeTitle('hello') })).toBeVisible();
    expect(
      await screen.findByRole('heading', { level: 1, name: fakeTitle('hello') }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const id = router.state.location.pathname.split('/').at(-1);
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        body: { message: 'hello' },
        method: 'POST',
        path: `/api/conversations/${id}/executions`,
      }),
    );
    expect(api.calls.filter(({ path }) => path === '/api/conversations')).toHaveLength(1);
  });

  it('creates a project chat from the project composer and keeps its scope', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      features: { agentRuntime: true },
      projects: [project({ name: 'Projet Atlas' })],
    });
    const { router } = renderWorkspaceAt(`/app/projects/${PROJECT_ID}`, api);

    await user.click(await screen.findByRole('button', { name: 'Nouvelle conversation' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nouveau chat dans Projet Atlas' }),
    ).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Plan de lancement{Enter}');

    expect(await findInMain(fakeReply('Plan de lancement'))).toBeVisible();
    expect(
      within(await screen.findByRole('group', { name: 'Projet Atlas' })).getByRole('button', {
        name: fakeTitle('Plan de lancement'),
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Projet Atlas' })).toHaveAttribute(
      'href',
      `/app/projects/${PROJECT_ID}`,
    );
    expect(router.state.location.pathname).toMatch(/^\/app\/conversations\//u);
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        body: { projectId: PROJECT_ID },
        method: 'POST',
        path: '/api/conversations',
      }),
    );
  });

  it('answers in an existing chat without changing the route or the title', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      features: { agentRuntime: true },
      projects: [project()],
    });
    const { router } = renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Suite ?{Enter}');

    expect(await findInMain(fakeReply('Suite ?'))).toBeVisible();
    expect(router.state.location.pathname).toBe(`/app/conversations/${CONVERSATION_ID}`);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Synthèse du comité projet' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(within(screen.getByRole('main')).getAllByText(fakeReply('Suite ?'))).toHaveLength(1),
    );
  });

  it('keeps a draft typed in another chat while an answer is streaming, then sends it', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [
        conversation(),
        conversation({
          id: STANDALONE_CONVERSATION_ID,
          projectId: IMPLICIT_PROJECT_ID,
          projectKind: 'implicit',
          title: 'Chat libre',
        }),
      ],
      features: { agentRuntime: true },
      projects: [project(), project({ id: IMPLICIT_PROJECT_ID, kind: 'implicit', name: null })],
    });
    const release = api.holdExecutions();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Un{Enter}');
    expect(await findInMain('Alfred réfléchit…')).toBeVisible();

    await user.click(await sidebar().findByRole('button', { name: 'Chat libre' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat libre' })).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Deux{Enter}');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Deux');
    expect(screen.getByText(/répond dans une autre conversation/u)).toBeVisible();
    expect(api.calls.filter(({ path }) => path.endsWith('/executions'))).toHaveLength(1);

    release();
    await waitFor(() =>
      expect(screen.queryByText(/répond dans une autre conversation/u)).not.toBeInTheDocument(),
    );
    await user.keyboard('{Enter}');
    expect(await findInMain(fakeReply('Deux'))).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });

  it('shows an answer as interrupted when its stream closes without a terminal state', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      features: { agentRuntime: true },
      projects: [project()],
    });
    api.interruptExecutions();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Suite ?{Enter}');

    const alert = await within(screen.getByRole('main')).findByRole('alert');
    expect(alert).toHaveTextContent('La réponse a été interrompue avant la fin.');
    expect(alert.closest('li')).toHaveTextContent(fakeReply('Suite ?'));
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeInTheDocument();
  });
});
