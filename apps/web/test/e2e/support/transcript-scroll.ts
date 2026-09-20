import { expect, type Page } from '@playwright/test';

/** The conversation's own scroll area, the only element the follower may scroll. */
export const TRANSCRIPT_SCROLLER = '[data-slot="conversation-scroll"]';

/** Scroll offsets of the conversation's scroll area and of the document. */
export function scrollMetrics(page: Page) {
  return page.locator(TRANSCRIPT_SCROLLER).evaluate((element) => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      top: element.scrollTop,
      gap: element.scrollHeight - element.clientHeight - element.scrollTop,
      overflow: element.scrollHeight - element.clientHeight,
      documentTop: root.scrollTop,
      documentExcess: root.scrollHeight - innerHeight,
    };
  });
}

/** The document itself never scrolled and has nothing to scroll. */
export async function expectDocumentStill(page: Page): Promise<void> {
  const { documentTop, documentExcess } = await scrollMetrics(page);
  expect(documentTop).toBe(0);
  expect(documentExcess).toBeLessThanOrEqual(1);
}

/** Waits until the scroll area has stopped moving (a smooth wheel scroll ends) and returns its top. */
export async function settledTop(page: Page): Promise<number> {
  return page.locator(TRANSCRIPT_SCROLLER).evaluate(async (element) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let top = element.scrollTop;
    for (let still = 0; still < 8;) {
      await frame();
      still = element.scrollTop === top ? still + 1 : 0;
      top = element.scrollTop;
    }
    return top;
  });
}

/**
 * Wheels over the conversation's scroll area, a notch at a time as a person would, until it
 * reaches its top or bottom (engines cap how far one wheel event scrolls).
 */
export async function wheelToEnd(page: Page, direction: 'top' | 'bottom'): Promise<number> {
  const box = (await page.locator(TRANSCRIPT_SCROLLER).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let notch = 0; notch < 60; notch += 1) {
    await page.mouse.wheel(0, direction === 'top' ? -2_000 : 2_000);
    await settledTop(page);
    const { top, overflow } = await scrollMetrics(page);
    if (direction === 'top' ? top <= 0 : overflow - top <= 1) break;
  }
  return settledTop(page);
}

/**
 * Records, from the first script of the page, the position of the conversation's scroll area at
 * each of its scroll events: landing jumps visit a handful of positions, an eased scroll through
 * a long history visits one per frame.
 */
export async function recordTranscriptScrolls(page: Page): Promise<() => Promise<number[]>> {
  await page.addInitScript((selector) => {
    const tops: number[] = [];
    Object.assign(window, { transcriptScrollTops: tops });
    document.addEventListener(
      'scroll',
      (event) => {
        if (event.target instanceof Element && event.target.matches(selector))
          tops.push(event.target.scrollTop);
      },
      true,
    );
  }, TRANSCRIPT_SCROLLER);
  return () =>
    page.evaluate(
      () => (window as unknown as { transcriptScrollTops: number[] }).transcriptScrollTops,
    );
}

/**
 * Appends a block `height` pixels tall at the end of the transcript, as streamed content would,
 * then returns the distance to the bottom after each animation frame for `durationMs`.
 */
export function growTranscript(page: Page, height: number, durationMs = 1_000): Promise<number[]> {
  return page.locator(TRANSCRIPT_SCROLLER).evaluate(
    async (element, growth) => {
      const block = document.createElement('li');
      block.style.height = `${growth.height}px`;
      block.textContent = 'Contenu ajouté pendant la réponse.';
      element.querySelector(':scope > ol')!.append(block);
      const gaps: number[] = [];
      const start = performance.now();
      while (performance.now() - start < growth.durationMs) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        gaps.push(element.scrollHeight - element.clientHeight - element.scrollTop);
      }
      return gaps;
    },
    { height, durationMs },
  );
}

/**
 * Makes the end of the transcript shrink for a moment and grow again, as a reasoning that folds
 * right before the first tokens of the answer does, then returns the distance to the bottom after
 * each animation frame for `durationMs`. With `forcedLayout`, a layout read clamps the view in the
 * same task as the growth (the browser reports the clamp after the growth); otherwise the frame's
 * own layout clamps it and the growth arrives before the next frame.
 */
export function shrinkThenGrow(
  page: Page,
  {
    forcedLayout,
    durationMs = 1_000,
  }: { readonly forcedLayout: boolean; readonly durationMs?: number },
): Promise<number[]> {
  return page.locator(TRANSCRIPT_SCROLLER).evaluate(
    async (element, options) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const gap = () => element.scrollHeight - element.clientHeight - element.scrollTop;
      const list = element.querySelector(':scope > ol')!;
      const folding = document.createElement('li');
      folding.style.height = '400px';
      list.append(folding);
      for (let waited = 0; waited < 120 && gap() > 1; waited += 1) await frame();
      folding.style.height = '80px';
      if (options.forcedLayout) void element.scrollHeight;
      else await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const answer = document.createElement('li');
      answer.style.height = '500px';
      list.append(answer);
      const gaps: number[] = [];
      const start = performance.now();
      while (performance.now() - start < options.durationMs) {
        await frame();
        gaps.push(gap());
      }
      return gaps;
    },
    { forcedLayout, durationMs },
  );
}

/**
 * Presses a key as a person would, a moment after the last script: Playwright's WebKit ignores a
 * key pressed right after an evaluation that awaited animation frames (such as `settledTop`),
 * even on a static page.
 */
export async function pressKey(page: Page, key: string): Promise<void> {
  await page.waitForTimeout(120);
  await page.keyboard.press(key);
}
