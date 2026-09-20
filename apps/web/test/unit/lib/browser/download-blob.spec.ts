import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from '@/lib/browser/download-blob';
import { downloadSkill } from '@/lib/skills/skill-errors';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubObjectUrls() {
  const createObjectURL = vi.fn(() => 'blob:alfred-test');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  return { createObjectURL, revokeObjectURL };
}

describe('downloadBlob', () => {
  it('hands the bytes to the browser under the given name, then releases them', () => {
    vi.useFakeTimers();
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const connected: boolean[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      // Firefox only follows the click of an anchor that is in the document.
      connected.push(this.isConnected);
    });
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' });

    downloadBlob(blob, 'Rapport été.pdf');

    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(connected).toEqual([true]);
    expect(clicked.download).toBe('Rapport été.pdf');
    expect(clicked.getAttribute('href')).toBe('blob:alfred-test');
    expect(clicked.isConnected).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:alfred-test');
  });

  it('serves the skill export, which names the file from the package type', () => {
    stubObjectUrls();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    downloadSkill(new Blob(['x'], { type: 'application/zip' }), 'synthese');
    downloadSkill(new Blob(['x'], { type: 'text/markdown' }), '');
    expect(names).toEqual(['synthese.zip', 'skill.md']);
  });
});
