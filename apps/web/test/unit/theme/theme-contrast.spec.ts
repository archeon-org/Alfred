import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const css = ['styles.css', 'styles/appearance-palettes.css']
  .map((file) => readFileSync(path.resolve(import.meta.dirname, '../../../src', file), 'utf8'))
  .join('\n');

// Read actual palette declarations, so changing a CSS color exercises the contrast gate.
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `Missing palette: ${selector}`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1]!, match[2]!]),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

const textPairs = [
  ['foreground', 'background'],
  ['foreground', 'canvas'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-muted', 'sidebar'],
  ['sidebar-muted', 'sidebar-accent'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
] as const;

function paletteFor(theme: string, accent: string): Record<string, string> {
  return {
    ...declarations(':root'),
    ...declarations(`html[data-accent='${accent}']`),
    ...(theme === 'dark'
      ? {
          ...declarations("html[data-theme='dark']"),
          ...declarations(`html[data-theme='dark'][data-accent='${accent}']`),
        }
      : {}),
  };
}

for (const theme of ['light', 'dark']) {
  describe(`${theme} theme`, () => {
    for (const accent of ['sage', 'blue', 'violet', 'rose', 'amber']) {
      if (accent !== 'sage') {
        it(`${accent} keeps the intended surface treatment and semantic statuses`, () => {
          const palette = paletteFor(theme, accent);
          const sage = paletteFor(theme, 'sage');
          for (const token of [
            'background',
            'canvas',
            'card',
            'popover',
            'foreground',
            'card-foreground',
            'popover-foreground',
            'secondary',
            'secondary-foreground',
            'muted',
            'muted-foreground',
            'input',
            'border',
            'sidebar',
            'sidebar-foreground',
            'sidebar-muted',
            'sidebar-accent',
            'sidebar-accent-foreground',
            'sidebar-border',
          ]) {
            if (theme === 'dark') expect(palette[token], token).toBe(sage[token]);
            else expect(palette[token], token).not.toBe(sage[token]);
          }
          for (const role of ['destructive', 'warning', 'info']) {
            expect(palette[role], role).toBe(sage[role]);
            expect(palette[`${role}-foreground`], role).toBe(sage[`${role}-foreground`]);
          }
        });
      }
      it(`${accent} meets WCAG AA text and focus contrast`, () => {
        const palette = paletteFor(theme, accent);
        for (const [foreground, background] of textPairs) {
          expect(
            contrast(palette[foreground]!, palette[background]!),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        for (const [foreground, background] of [
          ['ring', 'background'],
          ['ring', 'muted'],
          ['ring', 'canvas'],
          ['ring', 'card'],
          ['ring', 'popover'],
          ['input', 'card'],
          ['input', 'background'],
          ['sidebar-ring', 'sidebar'],
          ['sidebar-ring', 'sidebar-accent'],
        ]) {
          expect(
            contrast(palette[foreground!]!, palette[background!]!),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });
}

describe('neutral dark surfaces', () => {
  it('uses layered charcoal surfaces and bright readable text with every accent', () => {
    for (const accent of ['sage', 'blue', 'violet', 'rose', 'amber']) {
      const palette = paletteFor('dark', accent);
      expect(contrast(palette['muted-foreground']!, palette['card']!)).toBeGreaterThanOrEqual(7);
      expect(luminance(palette['foreground']!)).toBeGreaterThan(0.85);
      for (const token of [
        'background',
        'canvas',
        'card',
        'popover',
        'sidebar',
        'secondary',
        'muted',
        'accent',
        'sidebar-accent',
      ]) {
        const color = palette[token]!;
        expect(color.slice(1, 3)).toBe(color.slice(3, 5));
        expect(color.slice(3, 5)).toBe(color.slice(5, 7));
        expect(Number.parseInt(color.slice(1, 3), 16)).toBeGreaterThanOrEqual(24);
        expect(Number.parseInt(color.slice(1, 3), 16)).toBeLessThanOrEqual(48);
      }
    }
  });
});
