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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The chat panel is re-created when the route changes, and a settled live turn is swapped for its
// stored rows: query the current main element each time and assert visibility inside the wait.
const findInMain = (text: string | RegExp) =>
  waitFor(() => {
    const element = within(screen.getByRole('main')).getByText(text);
    expect(element).toBeVisible();
    return element;
  });
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
    // The live turn hands over to the stored rows as soon as the answer settles; a reference taken
    // before that swap would be stale, so visibility is asserted inside the wait itself.
    await findInMain('hello');
    await findInMain(fakeReply('hello'));
    expect(await sidebar().findByRole('button', { name: fakeTitle('hello') })).toBeVisible();
    expect(
      await screen.findByRole('heading', { level: 1, name: fakeTitle('hello') }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const id = router.state.location.pathname.split('/').at(-1);
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        body: { message: 'hello', submissionId: expect.any(String) as unknown },
        method: 'POST',
        path: `/api/conversations/${id}/executions`,
      }),
    );
    expect(api.calls.filter(({ path }) => path === '/api/conversations')).toHaveLength(1);
    // `fileUploads` is off: the body above carries no `attachmentIds`, the composer offers no
    // file control and the files API is never called.
    expect(screen.queryByRole('button', { name: 'Joindre des fichiers' })).not.toBeInTheDocument();
    expect(api.calls.filter(({ path }) => path.startsWith('/api/files'))).toEqual([]);
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

  it('runs two chats concurrently and preserves each answer while navigating between them', async () => {
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
    await waitFor(() =>
      expect(api.calls.filter(({ path }) => path.endsWith('/executions'))).toHaveLength(2),
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(await findInMain('Deux')).toBeVisible();
    expect(await findInMain('Alfred réfléchit…')).toBeVisible();
    expect(within(screen.getByRole('main')).queryByText('Un')).not.toBeInTheDocument();

    await user.click(await sidebar().findByRole('button', { name: 'Refonte du portail' }));
    await waitFor(() =>
      expect(sidebar().getByRole('button', { name: 'Refonte du portail' })).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    );
    await user.click(await sidebar().findByRole('button', { name: /^Synthèse du comité projet/u }));
    expect(await findInMain('Un')).toBeVisible();
    expect(await findInMain('Alfred réfléchit…')).toBeVisible();
    expect(within(screen.getByRole('main')).queryByText('Deux')).not.toBeInTheDocument();
    expect(sidebar().getAllByText('Réponse en cours')).toHaveLength(2);

    release();
    await waitFor(() =>
      expect(within(screen.getByRole('main')).getByText(fakeReply('Un'))).toBeVisible(),
    );
    await user.click(await sidebar().findByRole('button', { name: /^Chat libre/u }));
    expect(await findInMain(fakeReply('Deux'))).toBeVisible();
    expect(within(screen.getByRole('main')).getAllByText(fakeReply('Deux'))).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    expect(api.calls.filter(({ path }) => path.endsWith('/executions'))).toHaveLength(2);
  });

  it('reconciles the authoritative execution after its stream closes before the terminal snapshot', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      features: { agentRuntime: true },
      projects: [project()],
    });
    api.interruptExecutions();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Suite ?{Enter}');

    expect(await findInMain(fakeReply('Suite ?'))).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeInTheDocument(),
    );
    expect(within(screen.getByRole('main')).queryByRole('alert')).not.toBeInTheDocument();
    expect(
      api.calls.filter(({ path, method }) => path.includes('/api/executions/') && method === 'GET'),
    ).not.toHaveLength(0);
    expect(api.calls.filter(({ path }) => path.endsWith('/executions'))).toHaveLength(1);
  });

  it('creates and starts a new conversation while the previous chat is still thinking', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      projects: [project()],
      features: { agentRuntime: true },
    });
    const release = api.holdExecutions();
    const { router } = renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'First{Enter}');
    expect(await findInMain('Alfred réfléchit…')).toBeVisible();
    await user.click(sidebar().getByRole('button', { name: 'Nouvelle conversation' }));
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Second{Enter}');
    await waitFor(() =>
      expect(api.calls.filter(({ path }) => path.endsWith('/executions'))).toHaveLength(2),
    );
    expect(router.state.location.pathname).not.toBe(`/app/conversations/${CONVERSATION_ID}`);
    expect(router.state.location.state).toBeNull();
    expect(await findInMain('Second')).toBeVisible();
    expect(await findInMain('Alfred réfléchit…')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    release();
    await waitFor(() => {
      expect(within(screen.getByRole('main')).getByText(fakeReply('Second'))).toBeVisible();
      expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeVisible();
    });
  });

  it('keeps the runtime events of every answer behind its own button, across a reload', async () => {
    vi.stubEnv('VITE_DEBUG_EVENTS', 'true');
    localStorage.clear();
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      projects: [project()],
      features: { agentRuntime: true },
    });
    const view = renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'First{Enter}');
    await findInMain(fakeReply('First'));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Événements du runtime/u })).toHaveLength(1),
    );
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Second{Enter}');
    await findInMain(fakeReply('Second'));
    // The first answer keeps its events; the second answer gets its own, with the same count.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Événements du runtime/u })).toHaveLength(2),
    );
    const buttons = screen.getAllByRole('button', { name: /Événements du runtime/u });
    expect(buttons[0]).toHaveAccessibleName(buttons[1]!.getAttribute('aria-label') ?? '');
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Événements du runtime' });
    const firstExecution = api.calls.find(({ path }) => path.endsWith('/executions'));
    expect(firstExecution).toBeDefined();
    expect(within(dialog).getByRole('region', { name: 'Événements capturés' })).toHaveTextContent(
      'RUN_STARTED',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Stored rows own their events through their execution id after the screen is rebuilt.
    view.unmount();
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await findInMain(fakeReply('Second'));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Événements du runtime/u })).toHaveLength(2),
    );
  });

  it('opens the trace of an answer in the runtime console only when the API serves trace links', async () => {
    const user = userEvent.setup();
    const open = vi.fn().mockReturnValue(null);
    vi.stubGlobal('open', open);
    const api = createWorkspaceApi({
      conversations: [conversation()],
      projects: [project()],
      features: { agentRuntime: true, traceLinks: true },
    });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Trace{Enter}');
    await findInMain(fakeReply('Trace'));
    await user.click(await screen.findByRole('button', { name: 'Voir la trace de cette réponse' }));
    const link = await screen.findByRole('link', { name: 'Ouvrir la trace de cette réponse' });
    const executionId = api.calls
      .map(({ path }) => /^\/api\/executions\/([^/]+)\/trace-link$/u.exec(path)?.[1])
      .find((id) => id !== undefined);
    expect(executionId).toBeDefined();
    const url = `https://smith.langchain.com/o/org/projects/p/proj/r/${executionId}?poll=true`;
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no trace control when the capability is off', async () => {
    const user = userEvent.setup();
    const api = createWorkspaceApi({
      conversations: [conversation()],
      projects: [project()],
      features: { agentRuntime: true },
    });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Sans trace{Enter}');
    await findInMain(fakeReply('Sans trace'));
    expect(await screen.findByRole('button', { name: 'Copier la réponse' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Voir la trace de cette réponse' })).toBeNull();
    expect(api.calls.some(({ path }) => path.endsWith('/trace-link'))).toBe(false);
  });
});
