import { describe, expect, it } from 'vitest';

import { scrubExternalReferences } from '@/lib/markdown/svg-scrub';

const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;

describe('scrubExternalReferences', () => {
  it('removes every element and attribute that could load or embed foreign content', () => {
    const root = parse(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
        '<defs><marker id="arrow"><path d="M0 0L10 5"/></marker></defs>',
        '<image href="https://evil.test/p.png" width="10" height="10"/>',
        '<image xlink:href="https://evil.test/q.png"/>',
        '<use href="https://evil.test/sprite.svg#icon"/>',
        '<use href="#arrow"/>',
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.test/r.png"/></div></foreignObject>',
        '<a href="https://evil.test"><text>lien</text></a>',
        '<rect style="fill: red; background: url(https://evil.test/bg.png)" width="1" height="1"/>',
        '<style>@import url(https://evil.test/x.css); .node { fill: url(https://evil.test/f.png); stroke: black; }</style>',
        '<g onclick="alert(1)"><text>Décision</text></g>',
        '<path fill="url(https://evil.test/p.svg#g)" filter="url( \'https://evil.test/f.svg#f\' )" mask="url(#m)" d="M0 0"/>',
        '</svg>',
      ].join(''),
    );
    const removed = scrubExternalReferences(root);
    expect(removed).toBeGreaterThan(0);
    expect(root.querySelectorAll('image, foreignObject, img').length).toBe(0);
    expect([...root.querySelectorAll('use')].map((use) => use.getAttribute('href'))).toEqual([
      '#arrow',
    ]);
    expect(root.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('a text')?.textContent).toBe('lien');
    expect(root.querySelector('rect')?.hasAttribute('style')).toBe(false);
    expect(root.querySelector('style')?.textContent).not.toMatch(/evil\.test|@import/u);
    expect(root.querySelector('style')?.textContent).toContain('stroke: black');
    expect(root.querySelector('g')?.hasAttribute('onclick')).toBe(false);
    expect(root.querySelector('marker path')).not.toBeNull();
    // Presentation attributes may point at a local paint server, never outside the document.
    const painted = root.querySelector('path[mask]');
    expect(painted?.getAttribute('mask')).toBe('url(#m)');
    expect(painted?.hasAttribute('fill')).toBe(false);
    expect(painted?.hasAttribute('filter')).toBe(false);
    expect(root.outerHTML).not.toContain('evil.test');
  });

  it('leaves a clean diagram untouched', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:#123}</style><g class="node" style="fill: #abc"><rect width="1" height="1"/><text>A</text></g><path marker-end="url(#arrow)" d="M0 0"/></svg>',
    );
    const before = root.outerHTML;
    expect(scrubExternalReferences(root)).toBe(0);
    expect(root.outerHTML).toBe(before);
  });
});
