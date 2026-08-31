import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './app';

describe('App', () => {
  it('introduces Alfred as an approachable agentic workspace', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Alfred' })).toBeVisible();
    expect(
      screen.getByText(/an approachable workspace for orchestrating ai agents/i),
    ).toBeVisible();
  });

  it('shows the three platform foundations with accessible semantics', () => {
    render(<App />);

    const foundations = screen.getByRole('list', { name: /platform foundations/i });
    const items = within(foundations).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(within(foundations).getByText('React workspace')).toBeVisible();
    expect(within(foundations).getByText('NestJS API')).toBeVisible();
    expect(within(foundations).getByText('LangGraph runtime')).toBeVisible();
  });
});
