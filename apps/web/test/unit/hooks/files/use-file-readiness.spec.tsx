import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  READINESS_MAX_POLLS,
  READINESS_POLL_MS,
  useFileReadiness,
} from '@/hooks/files/use-file-readiness';
import { fileKeys } from '@/hooks/workspace/workspace-keys';
import { getFile } from '@/services/files/files.service';
import { ApiRequestError } from '@/services/http/api-json';
import { FILE_ID, storedFile } from '../../../support/files-api';

vi.mock('@/hooks/workspace/use-workspace-account', () => ({
  useWorkspaceAccount: () => ({ client: { request: vi.fn() }, userId: 'user-1' }),
}));
vi.mock('@/services/files/files.service', () => ({ getFile: vi.fn() }));
const mockedGet = vi.mocked(getFile);

const processing = storedFile({ readiness: 'processing' });
const ready = storedFile({ readiness: 'ready', updatedAt: '2026-09-18T10:00:00.000Z' });

function renderReadiness(options: Parameters<typeof useFileReadiness>[1]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, ...renderHook(() => useFileReadiness(FILE_ID, options), { wrapper }) };
}
const tick = (count = 1) => act(() => vi.advanceTimersByTimeAsync(READINESS_POLL_MS * count));

afterEach(() => {
  vi.useRealTimers();
  mockedGet.mockReset();
});

describe('useFileReadiness', () => {
  it('reads every two seconds until the file settles, then tells once and refreshes the lists', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGet.mockResolvedValueOnce(processing).mockResolvedValue(ready);
    const onSettled = vi.fn();
    const view = renderReadiness({ enabled: true, known: processing, onSettled });
    expect(view.result.current).toBe(processing);
    expect(mockedGet).not.toHaveBeenCalled();
    await tick();
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
    await tick();
    await waitFor(() => expect(view.result.current).toEqual(ready));
    expect(onSettled).toHaveBeenCalledExactlyOnceWith(ready);
    expect(view.invalidate).toHaveBeenCalledWith({ queryKey: fileKeys.lists('user-1') });
    await tick(5);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('stops after its budget of reads, and stops at once when it unmounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGet.mockResolvedValue(processing);
    const view = renderReadiness({ enabled: true, known: processing });
    await tick(READINESS_MAX_POLLS + 15);
    expect(mockedGet).toHaveBeenCalledTimes(READINESS_MAX_POLLS);

    mockedGet.mockClear();
    const other = renderReadiness({ enabled: true, known: processing });
    await tick(2);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    other.unmount();
    view.unmount();
    await tick(5);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('keeps trying through a transient failure, within the same budget', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGet.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(ready);
    const onUnavailable = vi.fn();
    const view = renderReadiness({ enabled: true, known: processing, onUnavailable });
    await tick(2);
    await waitFor(() => expect(view.result.current).toEqual(ready));
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('ends the wait when the file was deleted elsewhere', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGet.mockRejectedValue(new ApiRequestError(404, 'file_not_found', 'Not found.'));
    const onUnavailable = vi.fn();
    renderReadiness({ enabled: true, known: processing, onUnavailable });
    await tick();
    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledExactlyOnceWith('Ce fichier n’est plus disponible.'),
    );
    await tick(5);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it('names a file known only by its id with one read, and reads nothing while disabled', async () => {
    mockedGet.mockResolvedValue(ready);
    const onSettled = vi.fn();
    const view = renderReadiness({ enabled: true, onSettled });
    expect(view.result.current).toBeUndefined();
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(ready));
    expect(mockedGet).toHaveBeenCalledTimes(1);

    mockedGet.mockClear();
    const idle = renderReadiness({ enabled: false, known: ready });
    expect(idle.result.current).toBe(ready);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
