import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    diagramType: 'flowchart',
  }),
  mermaidAPI: {
    getDiagramFromText: vi.fn().mockResolvedValue({ db: { getVertices: () => new Map() } }),
  },
}));
vi.mock('mermaid', () => ({ default: mermaid }));

import { MarkdownView } from '@/components/ui/markdown-view';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MarkdownView', () => {
  it('renders every block type as accessible elements without injecting HTML', () => {
    const { container } = render(
      <MarkdownView
        source={
          '## Plan\n\nTexte <script>alert(1)</script> avec `code`.\n\n- un\n- deux\n\n1. a\n\n> note\n\n```js\nlet x;\n```\n\n---\n\n[site](https://alfred.test) [mal](javascript:x)'
        }
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeVisible();
    // Raw HTML tags are skipped, never parsed: only their inert text remains.
    expect(screen.getByText(/^Texte alert\(1\) avec/u)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('note').closest('blockquote')).not.toBeNull();
    expect(container.querySelector('[data-language="js"] pre')).toHaveTextContent('let x;');
    expect(screen.getByText('js')).toBeVisible();
    expect(container.querySelector('hr')).not.toBeNull();
    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('href', 'https://alfred.test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.queryByRole('link', { name: 'mal' })).not.toBeInTheDocument();
    expect(screen.getByText('mal')).toBeVisible();
  });

  it('renders GitHub-flavoured tables, task lists, nested lists and strikethrough', () => {
    render(
      <MarkdownView
        source={[
          '| Rang | Marché | Fit |',
          '| --- | --- | --- |',
          '| 1 | Jet Aviation, Bâle | **Très fort** |',
          '| 2 | US aerospace | Moyen |',
          '',
          '- [x] cadrer',
          '- [ ] livrer',
          '  - sous-étape',
          '',
          '~~ancien~~ nouveau',
        ].join('\n')}
      />,
    );
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Rang', 'Marché', 'Fit']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Très fort').tagName).toBe('STRONG');
    expect(screen.getByRole('checkbox', { name: 'Tâche terminée' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tâche à faire' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tâche à faire' })).toBeDisabled();
    expect(screen.getByText('sous-étape').closest('ul')?.parentElement?.tagName).toBe('LI');
    expect(screen.getByText('ancien').tagName).toBe('DEL');
  });

  it('shows images as links instead of loading them and copies a code block', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { container } = render(
      <MarkdownView
        source={'![schéma](https://alfred.test/schema.png)\n\n```\nprint(1)\nprint(2)\n```'}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Image : schéma' })).toHaveAttribute(
      'href',
      'https://alfred.test/schema.png',
    );
    expect(screen.getByText('texte')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Copier le code' }));
    expect(writeText).toHaveBeenCalledWith('print(1)\nprint(2)');
    expect(screen.getByRole('button', { name: 'Copié' })).toBeVisible();
  });

  it('highlights a finished code block with theme variables and keeps the text intact', async () => {
    const { container } = render(<MarkdownView source={'```ts\nconst a = 1;\n```'} />);
    await waitFor(() =>
      expect(container.querySelector('pre[data-highlighted="true"]')).not.toBeNull(),
    );
    const keyword = [...container.querySelectorAll('pre span')].find(
      (span) => span.textContent === 'const',
    );
    expect(keyword).toHaveStyle({ color: 'var(--shiki-token-keyword)' });
    expect(container.querySelector('pre')).toHaveTextContent('const a = 1;');
  });

  it('keeps an unfinished fence readable while an answer streams', () => {
    const { container } = render(<MarkdownView source={'Voici :\n\n```ts\nconst a = 1;'} />);
    expect(container.querySelector('[data-language="ts"] pre')).toHaveTextContent('const a = 1;');
  });

  it('tells complete fences from open ones by their own closing line, not by counting markers', async () => {
    // A tilde fence may contain backtick lines; a longer fence may contain shorter ones; an
    // indented block has no fence at all. Each of these is complete and gets drawn.
    for (const source of [
      '~~~mermaid\ngraph TD; A-->B\n```\nnot a closer\n~~~',
      '````mermaid\ngraph TD; A-->B\n```\n````',
      'Texte :\n\n```mermaid\ngraph TD; A-->B\n```\n\n    indented code\n',
    ]) {
      mermaid.render.mockClear();
      const view = render(<MarkdownView source={source} />);
      await screen.findByRole('button', { name: 'Voir la source' });
      expect(mermaid.render).toHaveBeenCalledTimes(1);
      view.unmount();
    }
    // The same document without its last closing line is still open.
    mermaid.render.mockClear();
    render(<MarkdownView source={'~~~mermaid\ngraph TD; A-->B\n```'} />);
    expect(screen.queryByRole('figure')).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('closes a fence inside a quote or a list from the parser, whatever the container prefix', async () => {
    for (const source of [
      '> ```mermaid\n> graph TD; A-->B\n> ```',
      '> ```mermaid\n> graph TD; A-->B\n> ```\n> après',
      '- item\n\n    ```mermaid\n    graph TD; A-->B\n    ```',
      '- ```mermaid\n  graph TD; A-->B\n  ```',
      '> - ```mermaid\n>   graph TD; A-->B\n>   ```',
      '```mermaid\r\ngraph TD; A-->B\r\n```',
      '```mermaid\ngraph TD; A-->B\n\n```',
    ]) {
      mermaid.render.mockClear();
      const view = render(<MarkdownView source={source} />);
      await screen.findByRole('button', { name: 'Voir la source' });
      expect(mermaid.render).toHaveBeenCalledTimes(1);
      view.unmount();
    }
    // The same blocks still open: no closing line, or only blank lines after the content.
    for (const source of [
      '> ```mermaid\n> graph TD; A-->B',
      '- ```mermaid\n  graph TD; A-->B',
      '> - ```mermaid\n>   graph TD; A-->B',
      '- ```mermaid\n  graph TD; A-->B\n- suivant',
      '```mermaid\ngraph TD; A-->B\n\n',
      '```mermaid\n\n',
      '```mermaid',
      '```mermaid\ngraph TD; A-->B\n    ```',
    ]) {
      mermaid.render.mockClear();
      const view = render(<MarkdownView source={source} />);
      expect(screen.queryByRole('figure')).toBeNull();
      expect(mermaid.render).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('draws a completed mermaid fence and keeps an unfinished one as source', async () => {
    const { container, rerender } = render(
      <MarkdownView source={'Schéma :\n\n```mermaid\ngraph TD; A-->B'} />,
    );
    expect(container.querySelector('[data-language="mermaid"] pre')).toHaveTextContent(
      'graph TD; A-->B',
    );
    expect(screen.queryByRole('figure')).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
    rerender(<MarkdownView source={'Schéma :\n\n```mermaid\ngraph TD; A-->B\n```\n\nFin.'} />);
    await screen.findByRole('button', { name: 'Voir la source' });
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), 'graph TD; A-->B\n');
    expect(screen.getByText('Fin.')).toBeVisible();
  });

  it('shows an empty label for a blank document', () => {
    render(<MarkdownView emptyLabel="Rien ici." source={'  \n'} />);

    expect(screen.getByText('Rien ici.')).toBeVisible();
  });
});
