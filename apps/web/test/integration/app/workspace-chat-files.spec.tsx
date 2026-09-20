import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFilesApi, FILE_ID, pdfFile, storedFile } from '../../support/files-api';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { CONVERSATION_ID, conversation, fakeReply, project } from '../../support/workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const seed = { conversations: [conversation()], projects: [project()] };
const executionBodies = (api: ReturnType<typeof createFilesApi>) =>
  api.calls
    .filter(({ method, path }) => method === 'POST' && path.endsWith('/executions'))
    .map(({ body }) => body as Record<string, unknown>);
const main = () => within(screen.getByRole('main'));

describe('Chat with files', () => {
  it('uploads from the composer, sends the ids and shows the names under the message', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ features: { agentRuntime: true }, workspace: seed });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);

    await user.upload(await screen.findByLabelText('Fichiers à joindre'), pdfFile());
    const chips = await screen.findByRole('list', { name: 'Fichiers joints' });
    await waitFor(() =>
      expect(within(chips).getByRole('listitem')).toHaveAttribute('aria-busy', 'false'),
    );
    const upload = api.fileCalls.find(({ method }) => method === 'POST');
    expect(upload?.path).toBe('/api/files');
    expect(upload?.body).toMatchObject({ fileName: 'rapport.pdf', folderId: null });
    expect(upload?.headers.has('content-type')).toBe(false);
    expect(upload?.headers.get('authorization')).toBe('Bearer memory-only-test-token');

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Résume ce document{Enter}');
    await waitFor(() => expect(main().getByText(fakeReply('Résume ce document'))).toBeVisible());
    const uploadedId = api.files[0]!.id;
    expect(executionBodies(api)).toEqual([
      {
        message: 'Résume ce document',
        submissionId: expect.any(String) as unknown,
        attachmentIds: [uploadedId],
      },
    ]);
    // Accepted: the chips leave the composer, and the stored row names the file.
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(main().getByRole('list', { name: 'Fichiers joints au message' })).getByText(
          'rapport.pdf',
        ),
      ).toBeVisible(),
    );

    // The next message has no file: the field is left out again.
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Merci{Enter}');
    await waitFor(() => expect(executionBodies(api)).toHaveLength(2));
    expect(executionBodies(api)[1]).toEqual({
      message: 'Merci',
      submissionId: expect.any(String) as unknown,
    });
  });

  it('sends a message that is its files alone', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ features: { agentRuntime: true }, workspace: seed });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.upload(await screen.findByLabelText('Fichiers à joindre'), pdfFile());
    const send = screen.getByRole('button', { name: 'Envoyer le message' });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);
    await waitFor(() => expect(executionBodies(api)).toHaveLength(1));
    expect(executionBodies(api)[0]).toMatchObject({
      message: '',
      attachmentIds: [api.files[0]!.id],
    });
  });

  it('carries the files of the first message into the chat it creates', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ features: { agentRuntime: true } });
    const { router } = renderWorkspaceAt('/app', api);
    await user.upload(await screen.findByLabelText('Fichiers à joindre'), pdfFile());
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Fichiers joints' })).getByRole('listitem'),
      ).toHaveAttribute('aria-busy', 'false'),
    );
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Analyse{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/conversations\//u));
    await waitFor(() => expect(executionBodies(api)).toHaveLength(1));
    expect(executionBodies(api)[0]).toMatchObject({
      message: 'Analyse',
      attachmentIds: [api.files[0]!.id],
    });
    expect(router.state.location.state).toBeNull();
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
  });

  it('hands the files to the new chat as ids when the message cannot be sent yet', async () => {
    const user = userEvent.setup();
    // No agent bridge: the chat is created, the message waits as a draft with its files.
    const api = createFilesApi({ files: [storedFile()] });
    const { router } = renderWorkspaceAt('/app', api);
    await user.upload(await screen.findByLabelText('Fichiers à joindre'), pdfFile('note.pdf'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Fichiers joints' })).getByRole('listitem'),
      ).toHaveAttribute('aria-busy', 'false'),
    );
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Plus tard{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/conversations\//u));
    const uploadedId = api.files[0]!.id;
    // Ids only: no file name enters the browser history.
    expect(router.state.location.state).toEqual({
      draft: 'Plus tard',
      attachmentIds: [uploadedId],
    });
    // The composer of the new chat replaces the one that created it: query it inside the wait.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Plus tard'),
    );
    expect(
      await within(await screen.findByRole('list', { name: 'Fichiers joints' })).findByText(
        'note.pdf',
      ),
    ).toBeVisible();
    expect(executionBodies(api)).toEqual([]);
  });

  it('names the handed-over files again after a reload, and says when one is gone', async () => {
    // A reload keeps the router state but not React memory: the API names the chips.
    const api = createFilesApi({ files: [storedFile({ name: 'bail.pdf' })], workspace: seed });
    renderWorkspaceAt(
      {
        pathname: `/app/conversations/${CONVERSATION_ID}`,
        state: {
          draft: 'Plus tard',
          attachmentIds: [FILE_ID, '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9aff'],
        },
      },
      api,
    );
    const chips = await screen.findByRole('list', { name: 'Fichiers joints' });
    expect(await within(chips).findByText('bail.pdf')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '« Fichier » : Ce fichier n’est plus disponible.',
      ),
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Plus tard');
    expect(api.fileCalls.filter(({ method }) => method === 'GET').map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        `/api/files/${FILE_ID}`,
        '/api/files/5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9aff',
      ]),
    );
  });

  it('shows the files a stored message carried, a deleted one included', async () => {
    const api = createFilesApi({ features: { agentRuntime: true }, workspace: seed });
    const base = api.fetch.getMockImplementation()!;
    api.fetch.mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith(`/conversations/${CONVERSATION_ID}/messages`)) return base(input, init);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  id: '33333333-3333-4333-8333-333333333331',
                  conversationId: CONVERSATION_ID,
                  executionId: null,
                  role: 'user',
                  content: 'Voici le contrat',
                  createdAt: '2026-09-11T09:00:00.000Z',
                  attachments: [
                    {
                      fileId: FILE_ID,
                      name: 'contrat.docx',
                      kind: 'docx',
                      mediaType: 'application/octet-stream',
                      sizeBytes: 2048,
                      available: false,
                      delivery: 'unavailable',
                      truncated: false,
                    },
                  ],
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );
    });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    const files = await screen.findByRole('list', { name: 'Fichiers joints au message' });
    expect(within(files).getByRole('listitem')).toHaveTextContent('contrat.docxfichier supprimé');
  });

  it('makes no files request and offers no file control while the capability is off', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({
      enabled: false,
      features: { agentRuntime: true },
      workspace: seed,
    });
    renderWorkspaceAt(`/app/conversations/${CONVERSATION_ID}`, api);
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Salut{Enter}');
    await waitFor(() => expect(main().getByText(fakeReply('Salut'))).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Joindre des fichiers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Fichiers' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Joignez des PDF/u)).not.toBeInTheDocument();
    expect(api.fileCalls).toEqual([]);
    expect(executionBodies(api)[0]).toEqual({
      message: 'Salut',
      submissionId: expect.any(String) as unknown,
    });
  });
});
