import type { Mermaid } from 'mermaid';
import mermaid from 'mermaid';
import { describe, expect, it, vi } from 'vitest';

import { drawDiagram, imageNodes, SECURE_CONFIG_KEYS } from '@/lib/markdown/mermaid-render';

const options = {
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  flowchart: { htmlLabels: false },
} as const;

describe('imageNodes with the real parser', () => {
  it.each([
    ['unquoted key', 'flowchart TD\n  A@{ img: "https://synthetic.invalid/a.png", label: "x" }'],
    [
      'double-quoted key',
      'flowchart TD\n  A@{ "img": "https://synthetic.invalid/b.png", label: "x", w: 60, h: 60 }',
    ],
    [
      'single-quoted key',
      "flowchart TD\n  A@{ 'img': 'https://synthetic.invalid/c.png', label: 'x' }",
    ],
    [
      'escaped key',
      'flowchart TD\n  A@{ "\\u0069mg": "https://synthetic.invalid/d.png", label: "x" }',
    ],
    [
      'multi-line metadata',
      'flowchart TD\n  A@{\n    label: "x"\n    img: https://synthetic.invalid/e.png\n  }',
    ],
  ])('finds the node that would load an image (%s)', async (_label, source) => {
    mermaid.initialize({ ...options, secure: [...SECURE_CONFIG_KEYS] });
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
    expect(imageNodes(diagram)).toEqual(['A']);
  });

  it('lets a diagram without images through, icons included', async () => {
    mermaid.initialize({ ...options, secure: [...SECURE_CONFIG_KEYS] });
    for (const source of [
      'flowchart LR\n  A[Brief] --> B{Décision}\n  B -->|oui| C[Livraison]',
      'flowchart LR\n  A@{ shape: rect, label: "plain" } --> B',
      'flowchart LR\n  A@{ icon: "fa:user", form: "square", label: "icône" } --> B',
      'sequenceDiagram\n  Alice->>Bob: Bonjour',
    ]) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(source);
      expect(imageNodes(diagram)).toEqual([]);
    }
  });

  it('reads an image from a plain object database as well as from a map', () => {
    expect(imageNodes({ db: { getVertices: () => ({ A: { img: 'x' }, B: {} }) } })).toEqual(['A']);
    expect(imageNodes({ db: { getVertices: () => new Map([['A', { img: '  ' }]]) } })).toEqual([]);
    expect(imageNodes({ db: {} })).toEqual([]);
    expect(imageNodes({})).toEqual([]);
  });
});

describe('directives under the secure keys', () => {
  it('cannot put HTML back into labels, inject CSS or retheme, at any nesting level', async () => {
    mermaid.initialize({ ...options, theme: 'base', secure: [...SECURE_CONFIG_KEYS] });
    const parsed = await mermaid.parse(
      [
        '%%{init: {"themeCSS": ".node { cursor: url(https://synthetic.invalid/c.cur) }", "theme": "dark", "htmlLabels": true, "flowchart": {"htmlLabels": true, "nodeSpacing": 77}, "themeVariables": {"primaryColor": "#ff0000"}, "fontFamily": "x; cursor: url(https://synthetic.invalid/d.cur)"}}%%',
        'flowchart LR',
        '  A --> B',
      ].join('\n'),
    );
    expect(parsed).toMatchObject({ diagramType: 'flowchart-v2' });
    const config = mermaid.mermaidAPI.getConfig();
    // The directive itself was applied: only its secure keys were dropped.
    expect(config.flowchart?.nodeSpacing).toBe(77);
    expect(config.themeCSS).toBeUndefined();
    expect(config.theme).toBe('base');
    expect(config.htmlLabels).toBe(false);
    expect(config.flowchart?.htmlLabels).toBe(false);
    const variables = config.themeVariables as Record<string, unknown> | undefined;
    expect(variables?.primaryColor).not.toBe('#ff0000');
    expect(config.fontFamily).not.toContain('synthetic.invalid');
    expect(variables?.fontFamily).not.toContain('synthetic.invalid');
  });

  it('applies to YAML front matter the same way', async () => {
    mermaid.initialize({ ...options, theme: 'base', secure: [...SECURE_CONFIG_KEYS] });
    await mermaid.parse(
      [
        '---',
        'config:',
        '  "theme": forest',
        '  themeCSS: ".x { fill: url(https://synthetic.invalid/f.svg) }"',
        '  flowchart:',
        '    "\\u0068tmlLabels": true',
        '    nodeSpacing: 88',
        '---',
        'flowchart LR',
        '  A --> B',
      ].join('\n'),
    );
    const config = mermaid.mermaidAPI.getConfig();
    expect(config.flowchart?.nodeSpacing).toBe(88);
    expect(config.theme).toBe('base');
    expect(config.themeCSS).toBeUndefined();
    expect(config.flowchart?.htmlLabels).toBe(false);
  });
});

describe('drawDiagram', () => {
  function fakeMermaid(vertices: Record<string, { img?: string }>) {
    const calls: string[] = [];
    const api = {
      initialize: vi.fn(),
      render: vi.fn(async (id: string) => {
        calls.push(`render:${id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { svg: `<svg data-id="${id}"/>` };
      }),
      mermaidAPI: {
        getDiagramFromText: vi.fn(async (source: string) => {
          calls.push(`parse:${source}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { db: { getVertices: () => new Map(Object.entries(vertices)) } };
        }),
      },
    };
    return { api: api as unknown as Mermaid, calls, mocks: api };
  }

  it('inspects then draws one diagram at a time, in order, and locks the secure keys', async () => {
    const { api, calls, mocks } = fakeMermaid({ A: {} });
    const [first, second] = await Promise.all([
      drawDiagram(api, 'one', 'graph TD; A', { theme: 'base' }),
      drawDiagram(api, 'two', 'graph TD; B', { theme: 'base' }),
    ]);
    expect(first).toEqual({ svg: '<svg data-id="one"/>' });
    expect(second).toEqual({ svg: '<svg data-id="two"/>' });
    expect(calls).toEqual(['parse:graph TD; A', 'render:one', 'parse:graph TD; B', 'render:two']);
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'base' }));
    const options = mocks.initialize.mock.calls[0]?.[0] as { secure?: readonly string[] };
    expect(options.secure).toEqual(expect.arrayContaining(['htmlLabels', 'themeCSS']));
  });

  it('never draws a diagram whose parsed node carries an image, and keeps the queue alive', async () => {
    const { api, mocks } = fakeMermaid({ A: { img: 'https://synthetic.invalid/x.png' } });
    await expect(drawDiagram(api, 'one', 'graph TD; A', {})).resolves.toEqual({ external: ['A'] });
    expect(mocks.render).not.toHaveBeenCalled();
    mocks.mermaidAPI.getDiagramFromText.mockRejectedValueOnce(new Error('Parse error'));
    await expect(drawDiagram(api, 'two', 'graph TD; --', {})).rejects.toThrow('Parse error');
    await expect(drawDiagram(api, 'three', 'graph TD; A', {})).resolves.toEqual({
      external: ['A'],
    });
  });
});
