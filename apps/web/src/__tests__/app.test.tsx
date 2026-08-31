import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../app';

describe('App', () => {
  it('renders the three platform layers', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /agent workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Interface' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agents' })).toBeInTheDocument();
  });
});
