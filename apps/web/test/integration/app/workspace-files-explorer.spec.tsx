import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEARCH_DEBOUNCE_MS } from '@/hooks/ui/use-debounced-search';
import {
  createFilesApi,
  FILE_ID,
  fileFolder,
  FOLDER_ID,
  pdfFile,
  SECOND_FILE_ID,
  storedFile,
} from '../../support/files-api';
import { renderWorkspaceAt } from '../../support/render-workspace';
import { CONVERSATION_ID, conversation, project } from '../../support/workspace-api';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const main = () => within(screen.getByRole('main'));
const crumbs = () => within(main().getByRole('navigation', { name: 'Fil d’Ariane' }));
const fileList = () => main().findByRole('list', { name: 'Fichiers' });
const listCalls = (api: ReturnType<typeof createFilesApi>) =>
  api.fileCalls
    .filter(({ method, path }) => method === 'GET' && /^\/api\/files(\?|$)/u.test(path))
    .map(({ path }) => path);
const library = () => [
  storedFile({ name: 'racine.pdf' }),
  storedFile({ id: SECOND_FILE_ID, name: 'bail.pdf', folderId: FOLDER_ID }),
];

describe('File explorer route', () => {
  it('shows the fallback and makes no files request while the capability is off', async () => {
    const api = createFilesApi({ enabled: false, files: library() });
    renderWorkspaceAt('/app/files', api);
    expect(await screen.findByText('Les fichiers sont désactivés.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Mes fichiers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importer' })).not.toBeInTheDocument();
    expect(api.fileCalls).toEqual([]);
  });

  it('lists the top level, then a folder opened through its link, with the trail and the address', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ files: library(), folders: [fileFolder()] });
    const { router } = renderWorkspaceAt('/app/files', api);

    expect(await main().findByRole('heading', { level: 1, name: 'Mes fichiers' })).toBeVisible();
    const files = await fileList();
    expect(within(files).getAllByRole('listitem')).toHaveLength(1);
    expect(within(files).getByText('racine.pdf')).toBeVisible();
    expect(listCalls(api)[0]).toBe('/api/files?folderId=root&limit=20');
    expect(crumbs().getByText('Mes fichiers')).toHaveAttribute('aria-current', 'page');
    expect(crumbs().queryByRole('link')).toBeNull();
    expect(main().getByRole('meter', { name: 'Espace utilisé' })).toBeInTheDocument();

    const folder = within(main().getByRole('list', { name: 'Dossiers' })).getByRole('link', {
      name: /Contrats/u,
    });
    expect(folder).toHaveTextContent('1 fichier');
    await user.click(folder);

    expect(router.state.location.pathname).toBe(`/app/files/${FOLDER_ID}`);
    expect(await within(await fileList()).findByText('bail.pdf')).toBeVisible();
    expect(listCalls(api).at(-1)).toBe(`/api/files?folderId=${FOLDER_ID}&limit=20`);
    expect(crumbs().getByText('Contrats')).toHaveAttribute('aria-current', 'page');
    await user.click(crumbs().getByRole('link', { name: 'Mes fichiers' }));
    expect(router.state.location.pathname).toBe('/app/files');
  });

  it('says so when the folder of the address does not exist', async () => {
    const api = createFilesApi({ files: library() });
    renderWorkspaceAt(`/app/files/${FOLDER_ID}`, api);
    expect(await main().findByRole('heading', { name: 'Dossier introuvable' })).toBeVisible();
    expect(main().getByRole('link', { name: 'Retour à mes fichiers' })).toHaveAttribute(
      'href',
      '/app/files',
    );
  });

  it('creates a folder inside the open one and refuses to delete one that is not empty', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ files: library(), folders: [fileFolder()] });
    renderWorkspaceAt(`/app/files/${FOLDER_ID}`, api);
    await fileList();
    await user.click(main().getByRole('button', { name: 'Nouveau dossier' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau dossier' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nom du dossier' }), '2026');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le dossier' }));
    expect(await main().findByRole('link', { name: /2026/u })).toBeVisible();
    expect(
      api.fileCalls.find(({ method, path }) => method === 'POST' && path.endsWith('/folders'))
        ?.body,
    ).toEqual({ name: '2026', parentId: FOLDER_ID });
    expect(await main().findByText('Dossier créé.')).toBeVisible();

    await user.click(crumbs().getByRole('link', { name: 'Mes fichiers' }));
    await user.click(await main().findByRole('button', { name: 'Actions du dossier Contrats' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Supprimer ce dossier ?' });
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer le dossier' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'Ce dossier n’est pas vide. Déplacez ou supprimez d’abord son contenu.',
    );
  });

  it('moves a file to a folder chosen among radio rows that show each whole path', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({
      files: library(),
      folders: [
        fileFolder(),
        fileFolder({
          id: '6b1f4c0e-2d3e-4f40-9b5c-6d7e8f9a0b02',
          name: '2026',
          parentId: FOLDER_ID,
          depth: 2,
        }),
      ],
    });
    renderWorkspaceAt('/app/files', api);
    await fileList();
    await user.click(main().getByRole('button', { name: 'Actions du fichier racine.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer' }));
    const dialog = screen.getByRole('dialog', { name: 'Déplacer le fichier' });
    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'Mes fichiers (emplacement actuel)',
      'Mes fichiers / Contrats',
      'Mes fichiers / Contrats / 2026',
    ]);
    const submit = within(dialog).getByRole('button', { name: 'Déplacer ici' });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'Mes fichiers / Contrats' }));
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.fileCalls.find(({ method }) => method === 'PATCH')).toMatchObject({
      path: `/api/files/${FILE_ID}`,
      body: { folderId: FOLDER_ID },
    });
    expect(await main().findByText('Fichier déplacé.')).toBeVisible();
    await waitFor(() => expect(main().queryByText('racine.pdf')).toBeNull());
  });

  it('selects several files and deletes them after one confirmation', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({
      files: [
        storedFile({ name: 'a.pdf', usage: { conversations: 1, messages: 2 } }),
        storedFile({ id: SECOND_FILE_ID, name: 'b.pdf' }),
        storedFile({ id: '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a03', name: 'c.pdf' }),
      ],
    });
    renderWorkspaceAt('/app/files', api);
    await fileList();
    expect(main().queryByRole('group', { name: 'Actions sur la sélection' })).toBeNull();
    await user.click(main().getByRole('checkbox', { name: 'Sélectionner a.pdf' }));
    await user.click(main().getByRole('checkbox', { name: 'Sélectionner b.pdf' }));
    const bulk = within(main().getByRole('group', { name: 'Actions sur la sélection' }));
    expect(bulk.getByRole('status')).toHaveTextContent('2 sélectionnés');
    await user.click(bulk.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer ces fichiers ?' });
    expect(dialog).toHaveAccessibleDescription(
      '2 fichiers seront supprimés définitivement. 1 fichier est joint à 2 messages : le texte déjà envoyé reste dans les conversations.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer 2 fichiers' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(
      api.fileCalls.filter(({ method }) => method === 'DELETE').map(({ path }) => path),
    ).toEqual([`/api/files/${FILE_ID}`, `/api/files/${SECOND_FILE_ID}`]);
    expect(await main().findByText('2 fichiers supprimés.')).toBeVisible();
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Fichiers' })).getAllByRole('listitem'),
      ).toHaveLength(1),
    );
    expect(main().queryByRole('group', { name: 'Actions sur la sélection' })).toBeNull();

    // « Tout sélectionner » takes the whole list, then releases it.
    await user.click(main().getByRole('checkbox', { name: 'Tout sélectionner' }));
    expect(main().getByRole('checkbox', { name: 'Sélectionner c.pdf' })).toBeChecked();
    await user.click(main().getByRole('button', { name: 'Désélectionner' }));
    expect(main().getByRole('checkbox', { name: 'Sélectionner c.pdf' })).not.toBeChecked();
  });

  it('keeps search and filters in the address and searches the whole library', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const api = createFilesApi({ files: library(), folders: [fileFolder()] });
    const { router } = renderWorkspaceAt('/app/files', api);
    await fileList();
    await user.type(main().getByRole('searchbox', { name: 'Rechercher un fichier' }), 'bail');
    expect(router.state.location.search).toBe('');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    await waitFor(() => expect(router.state.location.search).toBe('?q=bail'));
    // A file of a sub-folder is found from the top level; folders give way to the results.
    expect(await within(await fileList()).findByText('bail.pdf')).toBeVisible();
    expect(listCalls(api).at(-1)).toBe('/api/files?search=bail&limit=20');
    expect(main().getByText('Résultats dans tous vos dossiers.')).toBeVisible();
    expect(main().queryByRole('list', { name: 'Dossiers' })).toBeNull();

    await user.click(
      main().getByRole('button', { name: 'Retirer le filtre « Recherche : bail »' }),
    );
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(main().getByRole('searchbox', { name: 'Rechercher un fichier' })).toHaveValue('');
  });

  it('reads the filters of a shared address', async () => {
    const api = createFilesApi({
      files: [
        ...library(),
        storedFile({
          id: '5a0f3b9e-1c2d-4e3f-8a4b-5c6d7e8f9a03',
          name: 'photo.png',
          kind: 'image',
        }),
      ],
    });
    renderWorkspaceAt('/app/files?type=image&etat=ready', api);
    expect(await within(await fileList()).findByText('photo.png')).toBeVisible();
    expect(listCalls(api)[0]).toBe('/api/files?kind=image&readiness=ready&limit=20');
    expect(
      within(main().getByRole('list', { name: 'Filtres actifs' }))
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['Type : Image', 'État : prêt']);
  });

  it('attaches a file to the conversation it was opened from, then goes back to it', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({
      files: [
        storedFile(),
        storedFile({ id: SECOND_FILE_ID, name: 'encours.pdf', readiness: 'processing' }),
      ],
      workspace: { conversations: [conversation()], projects: [project()] },
    });
    const { router } = renderWorkspaceAt(`/app/files?conversation=${CONVERSATION_ID}`, api);
    const back = await main().findByRole('link', { name: /Retour à la conversation/u });
    expect(back).toHaveAttribute('href', `/app/conversations/${CONVERSATION_ID}`);
    await waitFor(() => expect(back).toHaveTextContent('Synthèse du comité projet'));

    const attach = await main().findByRole('button', {
      name: 'Joindre rapport.pdf à la conversation',
    });
    expect(
      main().getByRole('button', { name: 'Joindre encours.pdf à la conversation' }),
    ).toBeDisabled();
    await user.click(attach);
    expect(
      await main().findByRole('button', { name: 'rapport.pdf est joint à la conversation' }),
    ).toBeDisabled();
    expect(main().getByText('« rapport.pdf » est joint au prochain message.')).toBeVisible();

    await user.click(back);
    expect(router.state.location.pathname).toBe(`/app/conversations/${CONVERSATION_ID}`);
    expect(
      await within(await screen.findByRole('list', { name: 'Fichiers joints' })).findByText(
        'rapport.pdf',
      ),
    ).toBeVisible();
  });

  it('offers no attach action without a conversation in the address', async () => {
    const api = createFilesApi({ files: [storedFile()] });
    renderWorkspaceAt('/app/files', api);
    await fileList();
    expect(main().queryByRole('button', { name: /à la conversation/u })).toBeNull();
    expect(main().queryByRole('link', { name: /Retour à la conversation/u })).toBeNull();
  });

  it('previews a ready image through the client and releases the object URL', async () => {
    const createUrl = vi.fn(() => 'blob:preview');
    const revokeUrl = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createUrl;
        static override revokeObjectURL = revokeUrl;
      },
    );
    const api = createFilesApi({
      files: [
        storedFile({ name: 'photo.png', kind: 'image', mediaType: 'image/png', pageCount: null }),
        storedFile({ id: SECOND_FILE_ID, name: 'doc.pdf' }),
      ],
    });
    const { unmount } = renderWorkspaceAt('/app/files', api);
    await fileList();
    await waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
    const previews = api.fileCalls.filter(({ path }) => path.endsWith('/preview'));
    // One request, for the image only, carrying the bearer token an <img src> could not send.
    expect(previews.map(({ path }) => path)).toEqual([`/api/files/${FILE_ID}/preview`]);
    expect(previews[0]?.headers.get('authorization')).toBe('Bearer memory-only-test-token');
    const image = screen.getByRole('main').querySelector('img');
    expect(image).toHaveAttribute('src', 'blob:preview');
    expect(image).toHaveAttribute('alt', '');
    expect(revokeUrl).not.toHaveBeenCalled();
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
  });

  it('edits the tags and the description of a file', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ files: [storedFile({ tags: ['ancien'] })] });
    renderWorkspaceAt('/app/files', api);
    await fileList();
    expect(main().getByRole('list', { name: 'Tags de rapport.pdf' })).toHaveTextContent('ancien');
    await user.click(main().getByRole('button', { name: 'Actions du fichier rapport.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Tags et description' }));
    const dialog = screen.getByRole('dialog', { name: 'Tags et description' });
    const tags = within(dialog).getByRole('textbox', { name: 'Tags' });
    expect(tags).toHaveValue('ancien');
    await user.clear(tags);
    await user.type(tags, 'contrat, 2026, Contrat');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'Bail signé');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.fileCalls.find(({ method }) => method === 'PATCH')?.body).toEqual({
      tags: ['contrat', '2026'],
      description: 'Bail signé',
    });
    expect(await main().findByText('Bail signé')).toBeVisible();
    expect(main().getByRole('list', { name: 'Tags de rapport.pdf' })).toHaveTextContent(
      'contrat2026',
    );
  });

  it('imports files dropped on the page into the open folder', async () => {
    const api = createFilesApi({ folders: [fileFolder()] });
    renderWorkspaceAt(`/app/files/${FOLDER_ID}`, api);
    expect(
      await main().findByText('Aucun fichier dans ce dossier. Importez-en, ou déposez-les ici.'),
    ).toBeVisible();
    const zone = screen.getByRole('main').querySelector('[data-slot="file-drop-zone"]')!;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } });
    expect(
      main().getByText('Déposez vos fichiers pour les importer dans « Contrats »'),
    ).toBeVisible();
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile('depose.pdf')], types: ['Files'] } });

    expect(await within(await fileList()).findByText('depose.pdf')).toBeVisible();
    expect(api.fileCalls.find(({ method }) => method === 'POST')?.body).toMatchObject({
      fileName: 'depose.pdf',
      folderId: FOLDER_ID,
    });
  });

  it('renames and moves a folder, and leaves a deleted folder for its parent', async () => {
    const user = userEvent.setup();
    const nested = '6b1f4c0e-2d3e-4f40-9b5c-6d7e8f9a0b02';
    const archives = '6b1f4c0e-2d3e-4f40-9b5c-6d7e8f9a0b03';
    const api = createFilesApi({
      folders: [
        fileFolder(),
        fileFolder({ id: nested, name: '2026', parentId: FOLDER_ID, depth: 2 }),
        fileFolder({ id: archives, name: 'Archives' }),
      ],
    });
    const { router } = renderWorkspaceAt('/app/files', api);
    await user.click(await main().findByRole('button', { name: 'Actions du dossier Contrats' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renommer' }));
    const rename = screen.getByRole('dialog', { name: 'Renommer le dossier' });
    const field = within(rename).getByRole('textbox', { name: 'Nom du dossier' });
    expect(field).toHaveValue('Contrats');
    await user.clear(field);
    await user.type(field, 'Baux');
    await user.click(within(rename).getByRole('button', { name: 'Renommer' }));
    expect(await main().findByRole('link', { name: /Baux/u })).toBeVisible();
    expect(await main().findByText('Dossier renommé.')).toBeVisible();

    // A folder never moves into itself or below: those destinations are not offered.
    await user.click(main().getByRole('button', { name: 'Actions du dossier Baux' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer' }));
    const move = screen.getByRole('dialog', { name: 'Déplacer le dossier' });
    expect(
      within(move)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Mes fichiers (emplacement actuel)', 'Mes fichiers / Archives']);
    await user.click(within(move).getByRole('radio', { name: 'Mes fichiers / Archives' }));
    await user.click(within(move).getByRole('button', { name: 'Déplacer ici' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      api.fileCalls
        .filter(({ method }) => method === 'PATCH')
        .map(({ path, body }) => [path, body]),
    ).toEqual([
      [`/api/files/folders/${FOLDER_ID}`, { name: 'Baux' }],
      [`/api/files/folders/${FOLDER_ID}`, { parentId: archives }],
    ]);
    await waitFor(() => expect(main().queryByRole('link', { name: /Baux/u })).toBeNull());

    // Deep in the tree, the trail links every ancestor and the open folder has its own menu.
    await act(() => router.navigate(`/app/files/${nested}`));
    expect(await crumbs().findByText('2026')).toHaveAttribute('aria-current', 'page');
    expect(
      crumbs()
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Mes fichiers', 'Archives', 'Baux']);
    await user.click(main().getByRole('button', { name: 'Actions du dossier 2026' }));
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer le dossier' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/app/files/${FOLDER_ID}`));
    expect(await main().findByText('Dossier supprimé.')).toBeVisible();
  });

  it('moves a selection and says how far it got when one file is refused', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({
      files: [storedFile({ name: 'a.pdf' }), storedFile({ id: SECOND_FILE_ID, name: 'b.pdf' })],
      folders: [fileFolder()],
    });
    api.failFiles(`PATCH /api/files/${SECOND_FILE_ID}`, 409, 'file_name_conflict');
    renderWorkspaceAt('/app/files', api);
    await fileList();
    await user.click(main().getByRole('checkbox', { name: 'Tout sélectionner' }));
    await user.click(
      within(main().getByRole('group', { name: 'Actions sur la sélection' })).getByRole('button', {
        name: 'Déplacer',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Déplacer les fichiers' });
    expect(dialog).toHaveTextContent('2 fichiers changent de dossier.');
    await user.click(within(dialog).getByRole('radio', { name: 'Mes fichiers / Contrats' }));
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer ici' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Un fichier porte déjà ce nom dans ce dossier. 1 fichier sur 2 traité.',
    );

    api.recoverFiles();
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer ici' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await main().findByText('2 fichiers déplacés.')).toBeVisible();
  });

  it('reports a download that the API can no longer serve', async () => {
    const user = userEvent.setup();
    const api = createFilesApi({ files: [storedFile()] });
    api.failFiles(`GET /api/files/${FILE_ID}/content`, 410, 'file_content_purged');
    renderWorkspaceAt('/app/files', api);
    await fileList();
    await user.click(main().getByRole('button', { name: 'Actions du fichier rapport.pdf' }));
    await user.click(screen.getByRole('menuitem', { name: 'Télécharger' }));
    expect(await main().findByRole('alert')).toHaveTextContent(
      'Le contenu de ce fichier n’est plus conservé.',
    );
  });

  it('invites to import into an empty library', async () => {
    renderWorkspaceAt('/app/files', createFilesApi());
    expect(
      await main().findByText(
        'Votre bibliothèque est vide. Importez un PDF, un DOCX ou une image, ou déposez-les ici.',
      ),
    ).toBeVisible();
  });
});
