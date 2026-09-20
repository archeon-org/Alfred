import { FILE_MAX_ATTACHMENTS_PER_MESSAGE } from '@alfred/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageComposer } from '@/components/workspace/conversation/message-composer';
import { useComposerAttachments } from '@/hooks/files/use-composer-attachments';
import { READINESS_POLL_MS } from '@/hooks/files/use-file-readiness';
import { useFileUpload } from '@/hooks/files/use-file-upload';
import type { AttachmentView } from '@/lib/files/composer-attachments';
import { getFile, uploadFile } from '@/services/files/files.service';
import { FILE_ID, pdfFile, pngFile, storedFile } from '../../../../support/files-api';

vi.mock('@/hooks/workspace/use-workspace-account', () => ({
  useWorkspaceAccount: () => ({ client: { request: vi.fn() }, userId: 'user-1' }),
}));
vi.mock('@/services/files/files.service', () => ({ getFile: vi.fn(), uploadFile: vi.fn() }));
const mockedUpload = vi.mocked(uploadFile);
const mockedGet = vi.mocked(getFile);

type Send = (message: string, attachments: readonly AttachmentView[]) => boolean;

function Harness({ onSend }: { readonly onSend?: Send }) {
  const uploads = useFileUpload();
  const store = useComposerAttachments(uploads);
  return <MessageComposer attachments={store.forScope('c1')} onSend={onSend} />;
}

function renderComposer(onSend?: Send) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...(onSend ? { onSend } : {})} />
    </QueryClientProvider>,
  );
}

const uploadsAs = (file = storedFile()) =>
  mockedUpload.mockImplementation((_client, request) =>
    Promise.resolve({
      deduplicated: false,
      file: { ...file, id: file.id, name: request.file.name },
    }),
  );
const chips = () => screen.getByRole('list', { name: 'Fichiers joints' });
const sendButton = () => screen.getByRole('button', { name: 'Envoyer le message' });

afterEach(() => {
  vi.useRealTimers();
  mockedUpload.mockReset();
  mockedGet.mockReset();
});

describe('MessageComposer without the fileUploads capability', () => {
  it('shows no paperclip, no file input and no word about files, and ignores a drop', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(() => true);
    const { container } = render(<MessageComposer onSend={onSend} />);
    expect(screen.queryByRole('button', { name: /Joindre/u })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/PDF|pièces jointes|fichier/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const form = container.querySelector('form')!;
    const dropped = fireEvent.drop(form, {
      dataTransfer: { files: [pdfFile()], types: ['Files'] },
    });
    // Not handled: the browser keeps its default behaviour.
    expect(dropped).toBe(true);
    fireEvent.paste(screen.getByLabelText('Message'), { clipboardData: { files: [pngFile()] } });
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Message'), 'Salut{Enter}');
    expect(onSend).toHaveBeenCalledWith('Salut', []);
  });
});

describe('MessageComposer with attachments', () => {
  it('adds a chip from the labelled file input, follows its upload and removes it', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    mockedUpload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ deduplicated: false, file: storedFile() });
        }),
    );
    renderComposer(vi.fn(() => true));
    expect(screen.getByRole('button', { name: 'Joindre des fichiers' })).toBeEnabled();
    const input = screen.getByLabelText('Fichiers à joindre');
    expect(input).toHaveAttribute('multiple');
    expect(input.getAttribute('accept')).toContain('.pdf');
    expect(input).not.toBeVisible();

    await user.upload(input, pdfFile());
    const chip = await within(chips()).findByRole('listitem');
    await waitFor(() => expect(chip).toHaveTextContent('rapport.pdfEnvoi…'));
    expect(chip).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 fichier joint : 1 en cours d’envoi.');
    expect(
      within(chip).getByRole('button', { name: 'Annuler l’envoi de rapport.pdf' }),
    ).toBeVisible();

    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(chip).toHaveAttribute('aria-busy', 'false'));
    expect(screen.getByRole('status')).toHaveTextContent('1 fichier joint : 1 prêt.');
    await user.click(within(chip).getByRole('button', { name: 'Retirer rapport.pdf' }));
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
  });

  it('takes files dropped on the form and files pasted in the message', async () => {
    uploadsAs();
    const { container } = renderComposer(vi.fn(() => true));
    const form = container.querySelector('form')!;
    fireEvent.dragEnter(form, { dataTransfer: { types: ['Files'] } });
    expect(form).toHaveAttribute('data-drop-target');
    const dropped = fireEvent.drop(form, {
      dataTransfer: { files: [pdfFile('contrat.pdf')], types: ['Files'] },
    });
    expect(dropped).toBe(false);
    expect(form).not.toHaveAttribute('data-drop-target');
    expect(await within(chips()).findByText('contrat.pdf')).toBeVisible();

    const field = screen.getByLabelText('Message');
    fireEvent.paste(field, { clipboardData: { files: [pngFile('capture.png')] } });
    expect(await within(chips()).findByText('capture.png')).toBeVisible();
    // Pasted text is not a file: the chips do not change.
    fireEvent.paste(field, { clipboardData: { files: [], getData: () => 'texte' } });
    // A dragged link or selection is not a file either.
    fireEvent.drop(form, { dataTransfer: { files: [], types: ['text/plain'] } });
    await waitFor(() => expect(within(chips()).getAllByRole('listitem')).toHaveLength(2));
  });

  it('sends the text with its files, keeps them on refusal and clears them once accepted', async () => {
    const user = userEvent.setup();
    uploadsAs();
    const onSend = vi.fn<Send>().mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderComposer(onSend);
    await user.upload(screen.getByLabelText('Fichiers à joindre'), pdfFile());
    await user.type(screen.getByLabelText('Message'), 'Résume ce document');
    await waitFor(() => expect(sendButton()).toBeEnabled());

    await user.click(sendButton());
    expect(onSend).toHaveBeenLastCalledWith('Résume ce document', [
      { fileId: FILE_ID, kind: 'pdf', name: 'rapport.pdf' },
    ]);
    // Refused: the draft and its file stay.
    expect(screen.getByLabelText('Message')).toHaveValue('Résume ce document');
    expect(within(chips()).getByText('rapport.pdf')).toBeVisible();

    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.queryByRole('list', { name: 'Fichiers joints' })).not.toBeInTheDocument();
  });

  it('allows a message that is its files alone', async () => {
    const user = userEvent.setup();
    uploadsAs();
    const onSend = vi.fn<Send>(() => true);
    renderComposer(onSend);
    expect(sendButton()).toBeDisabled();
    await user.upload(screen.getByLabelText('Fichiers à joindre'), pdfFile());
    await waitFor(() => expect(sendButton()).toBeEnabled());
    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledWith('', [
      { fileId: FILE_ID, kind: 'pdf', name: 'rapport.pdf' },
    ]);
  });

  it('holds the message while a file is analysed, within a bounded number of reads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    uploadsAs(storedFile({ readiness: 'processing' }));
    mockedGet
      .mockResolvedValueOnce(storedFile({ readiness: 'processing' }))
      .mockResolvedValue(storedFile({ readiness: 'ready', updatedAt: '2026-09-18T10:00:00.000Z' }));
    const onSend = vi.fn<Send>(() => true);
    renderComposer(onSend);
    await user.type(screen.getByLabelText('Message'), 'Lis-le');
    await user.upload(screen.getByLabelText('Fichiers à joindre'), pdfFile());

    const chip = await within(chips()).findByRole('listitem');
    await waitFor(() => expect(chip).toHaveTextContent('Analyse en cours…'));
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText('L’envoi sera possible dès que les fichiers seront prêts.'),
    ).toBeVisible();
    // Enter does not send either.
    await user.type(screen.getByLabelText('Message'), '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS));
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(sendButton()).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(chip).not.toHaveTextContent('Analyse en cours…');
    // Ready: the reads stop.
    await act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS * 5));
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('blocks on a failed file until it is retried or removed', async () => {
    const user = userEvent.setup();
    mockedUpload
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ deduplicated: false, file: storedFile() });
    renderComposer(vi.fn(() => true));
    await user.type(screen.getByLabelText('Message'), 'Bonjour');
    await user.upload(screen.getByLabelText('Fichiers à joindre'), pdfFile());
    const chip = await within(chips()).findByRole('listitem');
    await waitFor(() => expect(chip).toHaveTextContent('Échec'));
    expect(screen.getByRole('status')).toHaveTextContent(
      '« rapport.pdf » : Impossible d’envoyer le fichier. Vérifiez la connexion et réessayez.',
    );
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText('Retirez ou renvoyez le fichier en échec avant d’envoyer le message.'),
    ).toBeVisible();

    await user.click(within(chip).getByRole('button', { name: 'Renvoyer rapport.pdf' }));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    expect(mockedUpload.mock.calls[0]?.[1].uploadId).toBe(mockedUpload.mock.calls[1]?.[1].uploadId);
  });

  it('refuses a file the browser can already tell is wrong, with no request', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderComposer(vi.fn(() => true));
    await user.upload(
      screen.getByLabelText('Fichiers à joindre'),
      new File(['<!doctype html>'], 'photo.png', { type: 'image/png' }),
    );
    const chip = await within(chips()).findByRole('listitem');
    await waitFor(() => expect(chip).toHaveTextContent('Échec'));
    expect(screen.getByRole('status')).toHaveTextContent('Format non pris en charge');
    expect(within(chip).queryByRole('button', { name: /Renvoyer/u })).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('keeps to the number of files one message may carry and says so', async () => {
    const user = userEvent.setup();
    uploadsAs();
    mockedUpload.mockImplementation((_client, request) =>
      Promise.resolve({
        deduplicated: false,
        file: storedFile({ id: request.uploadId, name: request.file.name }),
      }),
    );
    renderComposer(vi.fn(() => true));
    await user.upload(
      screen.getByLabelText('Fichiers à joindre'),
      Array.from({ length: FILE_MAX_ATTACHMENTS_PER_MESSAGE + 2 }, (_, index) =>
        pdfFile(`doc-${index}.pdf`),
      ),
    );
    await waitFor(() =>
      expect(within(chips()).getAllByRole('listitem')).toHaveLength(
        FILE_MAX_ATTACHMENTS_PER_MESSAGE,
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `2 fichiers n’ont pas été ajoutés. Un message porte au plus ${FILE_MAX_ATTACHMENTS_PER_MESSAGE} fichiers.`,
    );
    expect(mockedUpload).toHaveBeenCalledTimes(FILE_MAX_ATTACHMENTS_PER_MESSAGE);
  });

  it('lets files be attached while the agent bridge is unavailable', async () => {
    const user = userEvent.setup();
    uploadsAs();
    renderComposer();
    await user.upload(screen.getByLabelText('Fichiers à joindre'), pdfFile());
    expect(await within(chips()).findByText('rapport.pdf')).toBeVisible();
    expect(sendButton()).toBeDisabled();
  });
});
