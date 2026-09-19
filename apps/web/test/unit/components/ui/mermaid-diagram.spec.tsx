import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  mermaidAPI: { getDiagramFromText: vi.fn() },
}));
vi.mock('mermaid', () => ({ default: mermaid }));

import { MERMAID_SOURCE_LIMIT, MermaidDiagram } from '@/components/ui/mermaid-diagram';

const fallback = <pre data-testid="source">graph TD; A--&gt;B</pre>;

/** The parsed diagram as Mermaid exposes it: a database of vertices, none of them an image. */
function parsedDiagram(vertices: Record<string, { img?: string }> = { A: {}, B: {} }) {
  return { db: { getVertices: () => new Map(Object.entries(vertices)) } };
}

beforeEach(() => {
  mermaid.mermaidAPI.getDiagramFromText.mockResolvedValue(parsedDiagram());
});

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('MermaidDiagram', () => {
  it('draws a completed diagram as adopted SVG nodes under the strict security level', async () => {
    const user = userEvent.setup();
    mermaid.render.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" height="40"><style>.a{}</style><g class="node"><text>A</text></g></svg>',
      diagramType: 'flowchart',
    });
    render(<MermaidDiagram fallback={fallback} source="graph TD; A-->B" />);
    expect(screen.getByRole('status')).toHaveTextContent('Diagramme en cours de rendu…');
    const figure = await screen.findByRole('figure', { name: 'Diagramme' });
    await waitFor(() => expect(figure.querySelector('svg')).not.toBeNull());
    expect(figure.querySelector('svg')).toHaveAttribute('role', 'img');
    expect(figure.querySelector('svg')).not.toHaveAttribute('height');
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        startOnLoad: false,
        suppressErrorRendering: true,
        htmlLabels: false,
        theme: 'base',
      }),
    );
    // Directives and front matter cannot put HTML back into labels, inject CSS or retheme.
    const options = mermaid.initialize.mock.calls[0]?.[0] as { secure?: readonly string[] };
    expect(options.secure).toEqual(
      expect.arrayContaining(['htmlLabels', 'themeCSS', 'themeVariables', 'theme']),
    );
    expect(mermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-/u),
      'graph TD; A-->B',
    );
    expect(screen.queryByTestId('source')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Voir la source' }));
    expect(screen.getByTestId('source')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Voir le diagramme' }));
    expect(screen.queryByTestId('source')).toBeNull();
  });

  it('falls back to the source with the reason when the diagram cannot be drawn', async () => {
    mermaid.render.mockRejectedValue(new Error('Parse error on line 2\nExpecting …'));
    render(<MermaidDiagram fallback={fallback} source="graph TD; A--" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le diagramme n’a pas pu être dessiné : Parse error on line 2. La source est affichée.',
    );
    expect(screen.getByTestId('source')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Voir la source' })).toBeNull();
  });

  it.each([
    'flowchart LR\n  A@{ img: "https://evil.test/p.png", label: "Logo" }',
    'flowchart LR\n  A["<img src=\'https://evil.test/q.png\'>"]',
    '%%{init: { "themeCSS": ".node { fill: url(https://evil.test/f.png) }" }}%%\nflowchart LR\n A',
    'classDiagram\n  class A\n  style A fill:url(#x)',
  ])('never hands a source with external resources to the renderer (%s)', (source) => {
    render(<MermaidDiagram fallback={fallback} source={source} />);
    expect(screen.getByRole('status')).toHaveTextContent('Diagramme non dessiné');
    expect(screen.getByTestId('source')).toBeVisible();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it.each([
    'flowchart TD\n  A@{ "img": "https://synthetic.invalid/quoted.png", label: "x", w: 60, h: 60 }',
    "flowchart TD\n  A@{ 'img': 'https://synthetic.invalid/single.png', label: 'x' }",
    'flowchart TD\n  A@{ "\\u0069mg": "https://synthetic.invalid/escaped.png", label: "x" }',
  ])(
    'refuses a parsed diagram whose node carries an image, whatever the spelling (%s)',
    async (source) => {
      // The text passes the first look; the parsed node is what stops the drawing.
      mermaid.mermaidAPI.getDiagramFromText.mockResolvedValue(
        parsedDiagram({ A: { img: 'https://synthetic.invalid/x.png' } }),
      );
      render(<MermaidDiagram fallback={fallback} source={source} />);
      expect(await screen.findByText(/Diagramme non dessiné/u)).toBeVisible();
      expect(screen.getByTestId('source')).toBeVisible();
      expect(mermaid.mermaidAPI.getDiagramFromText).toHaveBeenCalledWith(source);
      expect(mermaid.render).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Voir la source' })).toBeNull();
    },
  );

  it('never renders an oversized source and shows it instead', () => {
    render(<MermaidDiagram fallback={fallback} source={'x'.repeat(MERMAID_SOURCE_LIMIT + 1)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Diagramme trop long');
    expect(screen.getByTestId('source')).toBeVisible();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('redraws with the current palette when the theme changes', async () => {
    mermaid.render.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      diagramType: 'flowchart',
    });
    render(<MermaidDiagram fallback={fallback} source="graph TD; A-->B" />);
    await screen.findByRole('button', { name: 'Voir la source' });
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    act(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
  });
});
