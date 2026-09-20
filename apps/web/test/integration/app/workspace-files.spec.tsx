import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContextPanel } from '@/components/workspace/context/context-panel';
import { MessageComposer } from '@/components/workspace/conversation/message-composer';
import { useComposerAttachments } from '@/hooks/files/use-composer-attachments';
import { READINESS_MAX_POLLS, READINESS_POLL_MS } from '@/hooks/files/use-file-readiness';
import { useFileUpload } from '@/hooks/files/use-file-upload';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/ui/use-debounced-search';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';
import * as filesService from '@/services/files/files.service';
import { FILE_ID, pdfFile, SECOND_FILE_ID, storedFile } from '../../support/files-api';
import { installIntersectionObserver } from '../../support/intersection-observer';
import { CONVERSATION_ID } from '../../support/workspace-api';

const state = vi.hoisted(() => ({ fileUploads: true }));

vi.mock('@/hooks/feature-flags/use-feature-flags-query', () => ({
  useFeatureFlagsQuery: () => ({
    status: 'ready',
    flags: { skills: false, teams: false, fileUploads: state.fileUploads },
  }),
}));
vi.mock('@/hooks/workspace/use-workspace-account', () => ({
  useWorkspaceAccount: () => ({ client: { request: vi.fn() }, userId: 'user-1' }),
}));
// The HTTP boundary has its own tests; here the real hooks page, debounce and poll against it.
vi.mock('@/services/files/files.service', () => ({
  deleteFile: vi.fn(),
  getFile: vi.fn(),
  getFileContent: vi.fn(),
  getFileQuota: vi.fn(),
  listFiles: vi.fn(),
  listFolders: vi.fn(),
  updateFile: vi.fn(),
  uploadFile: vi.fn(),
}));
const api = vi.mocked(filesService);
const MIB = 1024 * 1024;
const sentinelIn = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[aria-hidden="true"].h-px');

function FilesPreview({ withComposer = true }: { readonly withComposer?: boolean }) {
  const tools = useWorkspaceTools();
  const uploads = useFileUpload();
  const store = useComposerAttachments(uploads);
  const attachments = store.forScope(CONVERSATION_ID);
  return (
    <>
      <ContextPanel
        files={{
          attachments: withComposer ? attachments : null,
          conversationId: withComposer ? CONVERSATION_ID : undefined,
          onDeleted: store.forget,
          onUpdated: store.settle,
          uploads,
        }}
        isLoading={false}
        tools={tools}
      />
      {/* No sender: attaching works even while the agent bridge is unavailable. */}
      {withComposer ? <MessageComposer attachments={attachments} /> : null}
    </>
  );
}

function renderFiles(props: { readonly withComposer?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FilesPreview {...props} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

async function openFilesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
  return screen.findByRole('heading', { name: 'Mes fichiers' });
}
const library = () => screen.findByRole('list', { name: 'Mes fichiers' });

beforeEach(() => {
  api.listFiles.mockResolvedValue({ items: [], nextCursor: null });
  api.listFolders.mockResolvedValue([]);
  api.getFileQuota.mockResolvedValue({
    usedBytes: Math.round(12.4 * MIB),
    reservedBytes: 0,
    limitBytes: 25 * MIB,
    maxFileBytes: 5 * MIB,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const mock of Object.values(api)) if (vi.isMockFunction(mock)) mock.mockReset();
  state.fileUploads = true;
});

describe('Fichiers tab behind the fileUploads capability', () => {
  it('removes the tab, and every request, when the capability is off', () => {
    state.fileUploads = false;
    renderFiles();
    expect(screen.queryByRole('tab', { name: 'Fichiers' })).not.toBeInTheDocument();
    // Skills is the only tab left: the list lays out the real count, one column.
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-1');
    expect(screen.queryByText(/fichiers arrivent/iu)).not.toBeInTheDocument();
    for (const mock of Object.values(api)) expect(mock).not.toHaveBeenCalled();
  });

  it('lists the library newest first, with the quota and a way to the explorer', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({
      items: [
        storedFile({ id: SECOND_FILE_ID, name: 'capture.png', kind: 'image', sizeBytes: 512 }),
        storedFile(),
      ],
      nextCursor: null,
    });
    renderFiles();
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-2');
    await openFilesTab(user);
    const list = await library();
    const rows = within(list).getAllByRole('listitem');
    expect(
      rows.map((row) => within(row).getByRole('button', { name: /^Joindre/u }).ariaLabel),
    ).toEqual(['Joindre capture.png au message', 'Joindre rapport.pdf au message']);
    expect(rows[0]).toHaveTextContent('Image · 512 octets');
    expect(rows[1]).toHaveTextContent('PDF · 2 Mio');
    expect(api.listFiles).toHaveBeenCalledWith(expect.anything(), {}, undefined, expect.anything());

    const meter = await screen.findByRole('meter', { name: 'Espace utilisé' });
    expect(meter).toHaveAttribute('max', String(25 * MIB));
    expect(meter).toHaveAttribute('value', String(Math.round(12.4 * MIB)));
    expect(screen.getAllByText('12,4 Mio sur 25 Mio')[0]).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ouvrir mes fichiers' })).toHaveAttribute(
      'href',
      `/app/files?conversation=${CONVERSATION_ID}`,
    );
  });

  it('sends one debounced search once typing settles and names an empty result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    api.listFiles.mockImplementation((_client, filters) =>
      Promise.resolve({ items: filters?.search ? [] : [storedFile()], nextCursor: null }),
    );
    renderFiles();
    await openFilesTab(user);
    await library();
    expect(api.listFiles).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un fichier' }), ' bilan ');
    expect(api.listFiles).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(await screen.findByText('Aucun fichier ne correspond à ces critères.')).toBeVisible();
    expect(api.listFiles).toHaveBeenCalledTimes(2);
    expect(api.listFiles.mock.calls[1]?.[1]).toEqual({ search: 'bilan' });
    // The search is an active filter, removable like the others.
    await user.click(
      screen.getByRole('button', { name: 'Retirer le filtre « Recherche : bilan »' }),
    );
    expect(screen.getByRole('searchbox', { name: 'Rechercher un fichier' })).toHaveValue('');
  });

  it('filters by type, state and conversation from one menu, with removable chips', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    renderFiles();
    await openFilesTab(user);
    await library();
    await user.click(screen.getByRole('button', { name: 'Filtrer les fichiers' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'PDF' }));
    await waitFor(() => expect(api.listFiles.mock.calls.at(-1)?.[1]).toEqual({ kind: 'pdf' }));

    await user.click(screen.getByRole('button', { name: 'Filtrer les fichiers (1 actifs)' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'PDF' })).toBeChecked();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Cette conversation' }));
    await waitFor(() =>
      expect(api.listFiles.mock.calls.at(-1)?.[1]).toEqual({
        kind: 'pdf',
        conversationId: CONVERSATION_ID,
      }),
    );
    await user.click(screen.getByRole('button', { name: /Filtrer les fichiers/u }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Échec' }));
    const chips = within(screen.getByRole('list', { name: 'Filtres actifs' }));
    expect(chips.getAllByRole('listitem').map((chip) => chip.textContent)).toEqual([
      'Type : PDF',
      'État : échec',
      'Cette conversation',
    ]);
    await user.click(chips.getByRole('button', { name: 'Retirer le filtre « Type : PDF »' }));
    await waitFor(() =>
      expect(api.listFiles.mock.calls.at(-1)?.[1]).toEqual({
        readiness: 'failed',
        conversationId: CONVERSATION_ID,
      }),
    );
  });

  it('reads the library again when the window regains focus and when the tab comes back', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    renderFiles();
    await openFilesTab(user);
    await library();
    expect(api.listFiles).toHaveBeenCalledTimes(1);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('tab', { name: 'Skills' }));
    await user.click(screen.getByRole('tab', { name: 'Fichiers' }));
    await waitFor(() => expect(api.listFiles).toHaveBeenCalledTimes(3));
    focusManager.setFocused(undefined);
  });

  it('loads the next page when the end of the list scrolls into view', async () => {
    const user = userEvent.setup();
    const observer = installIntersectionObserver();
    api.listFiles.mockImplementation((_client, _filters, cursor) =>
      Promise.resolve(
        cursor === undefined
          ? { items: [storedFile()], nextCursor: 'page-2' }
          : { items: [storedFile({ id: SECOND_FILE_ID, name: 'suite.pdf' })], nextCursor: null },
      ),
    );
    const { container } = renderFiles();
    await openFilesTab(user);
    const list = await library();
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    observer.intersect(sentinelIn(container) as Element);
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(api.listFiles.mock.calls.at(-1)?.[2]).toBe('page-2');
    expect(sentinelIn(container)).toBeNull();
  });

  it('announces loading, an empty library and a retryable failure', async () => {
    const user = userEvent.setup();
    api.listFiles.mockRejectedValueOnce(new Error('offline'));
    renderFiles();
    await openFilesTab(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger vos fichiers.',
    );
    api.listFiles.mockResolvedValue({ items: [], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByText(
        'Aucun fichier pour le moment. Importez un PDF, un DOCX ou une image.',
      ),
    ).toBeVisible();
  });

  it('attaches a file to the next message with one click, and only once', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    renderFiles();
    await openFilesTab(user);
    const row = within(await library()).getByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Joindre rapport.pdf au message' }));

    const chips = screen.getByRole('list', { name: 'Fichiers joints' });
    expect(within(chips).getByText('rapport.pdf')).toBeVisible();
    expect(screen.getAllByText('« rapport.pdf » est joint au prochain message.')[0]).toBeVisible();
    const attach = within(row).getByRole('button', { name: 'Joindre rapport.pdf au message' });
    expect(attach).toBeDisabled();
    expect(attach).toHaveAccessibleDescription(/Joint au prochain message\./u);
    // Removing the chip frees the row again.
    await user.click(within(chips).getByRole('button', { name: 'Retirer rapport.pdf' }));
    expect(attach).toBeEnabled();
    expect(api.getFile).not.toHaveBeenCalled();
  });

  it('explains why a file that is not ready, or a screen without composer, cannot attach', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({
      items: [
        storedFile({ readiness: 'failed', failureCode: 'no_readable_text' }),
        storedFile({ id: SECOND_FILE_ID, name: 'pret.pdf' }),
      ],
      nextCursor: null,
    });
    renderFiles({ withComposer: false });
    await openFilesTab(user);
    const [failed, ready] = within(await library()).getAllByRole('listitem');
    expect(failed).toHaveAttribute('data-readiness', 'failed');
    expect(within(failed!).getByRole('button', { name: /Joindre/u })).toBeDisabled();
    expect(failed).toHaveTextContent('Aucun texte lisible n’a été trouvé dans ce document.');
    expect(within(ready!).getByRole('button', { name: /Joindre/u })).toBeDisabled();
    expect(ready).toHaveTextContent('Ouvrez une conversation pour joindre ce fichier.');
    // Without a conversation the filter and the address carry none.
    expect(screen.getByRole('link', { name: 'Ouvrir mes fichiers' })).toHaveAttribute(
      'href',
      '/app/files',
    );
    await user.click(screen.getByRole('button', { name: 'Filtrer les fichiers' }));
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Cette conversation' })).toBeNull();
  });

  it('follows a file being analysed with bounded reads, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const processing = storedFile({ readiness: 'processing' });
    const ready = storedFile({ readiness: 'ready', updatedAt: '2026-09-18T10:00:00.000Z' });
    let analysed = false;
    api.listFiles.mockImplementation(() =>
      Promise.resolve({ items: [analysed ? ready : processing], nextCursor: null }),
    );
    api.getFile.mockImplementation(() => Promise.resolve(analysed ? ready : processing));
    renderFiles();
    await openFilesTab(user);
    const row = within(await library()).getByRole('listitem');
    expect(row).toHaveAttribute('data-readiness', 'processing');
    expect(row).toHaveTextContent('Analyse en cours…');
    expect(within(row).getByRole('button', { name: /Joindre/u })).toBeDisabled();
    // The list said "processing" a moment ago: no read before the first interval.
    expect(api.getFile).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS * 3));
    expect(api.getFile).toHaveBeenCalledTimes(3);
    analysed = true;
    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Mes fichiers' })).getByRole('listitem'),
      ).toHaveAttribute('data-readiness', 'ready'),
    );
    const reads = api.getFile.mock.calls.length;
    expect(reads).toBe(4);
    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS * 10));
    expect(api.getFile).toHaveBeenCalledTimes(reads);
    expect(
      within(screen.getByRole('list', { name: 'Mes fichiers' })).getByRole('button', {
        name: /Joindre/u,
      }),
    ).toBeEnabled();
  });

  it('gives up reading a file that never leaves analysis', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const processing = storedFile({ readiness: 'processing' });
    api.listFiles.mockResolvedValue({ items: [processing], nextCursor: null });
    api.getFile.mockResolvedValue(processing);
    renderFiles();
    await openFilesTab(user);
    await library();
    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS * (READINESS_MAX_POLLS + 20)));
    expect(api.getFile).toHaveBeenCalledTimes(READINESS_MAX_POLLS);
  });

  it('renames a file through the shared text dialog and returns focus to its menu', async () => {
    const user = userEvent.setup();
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    api.updateFile.mockResolvedValue(
      storedFile({ name: 'bilan.pdf', updatedAt: '2026-09-18T11:00:00.000Z' }),
    );
    renderFiles();
    await openFilesTab(user);
    await library();
    const opener = screen.getByRole('button', { name: 'Actions du fichier rapport.pdf' });
    await user.click(opener);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Télécharger',
      'Renommer',
      'Déplacer',
      'Supprimer',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Renommer' }));
    const dialog = screen.getByRole('dialog', { name: 'Renommer le fichier' });
    const field = within(dialog).getByRole('textbox', { name: 'Nom du fichier' });
    expect(field).toHaveValue('rapport.pdf');
    await user.clear(field);
    await user.type(field, 'bilan.pdf');
    api.listFiles.mockResolvedValue({
      items: [storedFile({ name: 'bilan.pdf' })],
      nextCursor: null,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Renommer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.updateFile).toHaveBeenCalledWith(expect.anything(), FILE_ID, { name: 'bilan.pdf' });
    expect(await screen.findByText('Fichier renommé.')).toBeVisible();
    expect(await screen.findByTitle('bilan.pdf')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Actions du fichier/u })).toHaveFocus(),
    );
  });

  it('deletes a file after a confirmation that says where it was sent', async () => {
    const user = userEvent.setup();
    const sent = storedFile({ usage: { conversations: 2, messages: 3 } });
    api.listFiles.mockResolvedValue({ items: [sent], nextCursor: null });
    api.deleteFile.mockResolvedValue(undefined);
    renderFiles();
    await openFilesTab(user);
    const row = within(await library()).getByRole('listitem');
    await user.click(within(row).getByRole('button', { name: 'Joindre rapport.pdf au message' }));
    expect(screen.getByRole('list', { name: 'Fichiers joints' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Actions du fichier rapport.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer ce fichier ?' });
    expect(dialog).toHaveAccessibleDescription(
      /joint à 3 messages dans 2 conversations.*le texte déjà envoyé reste dans ces conversations/u,
    );
    expect(api.deleteFile).not.toHaveBeenCalled();
    api.listFiles.mockResolvedValue({ items: [], nextCursor: null });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le fichier' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.deleteFile).toHaveBeenCalledWith(expect.anything(), FILE_ID);
    expect(await screen.findByText('Fichier supprimé.')).toBeVisible();
    // The chip of a deleted file leaves the composer with it.
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the reason when a deletion is refused', async () => {
    const user = userEvent.setup();
    const { ApiRequestError } = await import('@/services/http/api-json');
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    api.deleteFile.mockRejectedValue(new ApiRequestError(409, 'file_in_use', 'In use.'));
    renderFiles();
    await openFilesTab(user);
    await library();
    await user.click(screen.getByRole('button', { name: 'Actions du fichier rapport.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer le fichier' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Une réponse en cours utilise ce fichier.',
    );
  });

  it('imports files from the computer into the library, with an indeterminate state', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    api.uploadFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ deduplicated: false, file: storedFile() });
        }),
    );
    renderFiles();
    await openFilesTab(user);
    expect(screen.getByRole('button', { name: 'Importer' })).toBeEnabled();
    await user.upload(screen.getByLabelText('Fichiers à importer'), pdfFile());

    const sending = await screen.findByRole('list', { name: 'Envois en cours' });
    await waitFor(() => expect(sending).toHaveTextContent('rapport.pdfEnvoi…'));
    expect(within(sending).getByRole('listitem')).toHaveAttribute('aria-busy', 'true');
    expect(api.uploadFile.mock.calls[0]?.[1]).toMatchObject({ folderId: null });
    // An import goes to the library, not into the message being written.
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();

    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Envois en cours' })).toBeNull());
    expect(await screen.findByTitle('rapport.pdf')).toBeVisible();
  });

  it('keeps a refused import with its reason until it is retried or dismissed', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { ApiRequestError } = await import('@/services/http/api-json');
    api.uploadFile
      .mockRejectedValueOnce(new ApiRequestError(503, 'storage_unavailable', 'Unavailable.'))
      .mockResolvedValueOnce({ deduplicated: false, file: storedFile() });
    renderFiles();
    await openFilesTab(user);
    const input = screen.getByLabelText('Fichiers à importer');
    await user.upload(input, pdfFile());
    const sending = await screen.findByRole('list', { name: 'Envois en cours' });
    await waitFor(() => expect(sending).toHaveTextContent('rapport.pdfÉchec'));
    expect(
      screen.getByText('« rapport.pdf » : Le stockage est indisponible. Réessayez plus tard.'),
    ).toBeVisible();
    await user.click(within(sending).getByRole('button', { name: 'Renvoyer rapport.pdf' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Envois en cours' })).toBeNull());
    expect(api.uploadFile.mock.calls[0]?.[1].uploadId).toBe(
      api.uploadFile.mock.calls[1]?.[1].uploadId,
    );

    // A refusal of the content itself cannot be retried: it can only be dismissed.
    await user.upload(input, new File(['<!doctype html>'], 'page.png', { type: 'image/png' }));
    const refused = await screen.findByRole('list', { name: 'Envois en cours' });
    await waitFor(() => expect(refused).toHaveTextContent('page.pngÉchec'));
    expect(within(refused).queryByRole('button', { name: /Renvoyer/u })).toBeNull();
    await user.click(within(refused).getByRole('button', { name: 'Ignorer l’échec de page.png' }));
    expect(screen.queryByRole('list', { name: 'Envois en cours' })).toBeNull();
    expect(api.uploadFile).toHaveBeenCalledTimes(2);
    // Choosing nothing in the picker changes nothing.
    await user.upload(input, []);
    expect(api.uploadFile).toHaveBeenCalledTimes(2);
  });

  it('downloads through the client and names the file from its row', async () => {
    const user = userEvent.setup();
    const createUrl = vi.fn(() => 'blob:file');
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createUrl;
        static override revokeObjectURL = vi.fn();
      },
    );
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    api.listFiles.mockResolvedValue({ items: [storedFile()], nextCursor: null });
    api.getFileContent.mockResolvedValue(new Blob(['%PDF-']));
    renderFiles();
    await openFilesTab(user);
    await library();
    await user.click(screen.getByRole('button', { name: 'Actions du fichier rapport.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Télécharger' }));
    await waitFor(() => expect(names).toEqual(['rapport.pdf']));
    expect(api.getFileContent).toHaveBeenCalledWith(expect.anything(), FILE_ID);
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
  });
});
