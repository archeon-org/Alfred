import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownView } from '@/components/ui/markdown-view';

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
    expect(screen.getByText(/Texte <script>alert\(1\)<\/script> avec/u)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByText('note').closest('blockquote')).not.toBeNull();
    expect(container.querySelector('pre[data-language="js"]')).toHaveTextContent('let x;');
    expect(container.querySelector('hr')).not.toBeNull();
    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('href', 'https://alfred.test');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.queryByRole('link', { name: 'mal' })).not.toBeInTheDocument();
    expect(screen.getByText('[mal](javascript:x)')).toBeVisible();
  });

  it('shows an empty label for a blank document', () => {
    render(<MarkdownView emptyLabel="Rien ici." source={'  \n'} />);

    expect(screen.getByText('Rien ici.')).toBeVisible();
  });
});
