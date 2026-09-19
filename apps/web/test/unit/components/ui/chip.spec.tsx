import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BreadcrumbItem, Breadcrumbs, breadcrumbLinkClassName } from '@/components/ui/breadcrumbs';
import { Chip, ChipList } from '@/components/ui/chip';

describe('Chip', () => {
  it('is a list item whose remove button is its own control, never nested in another', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ChipList aria-label="Fichiers joints">
        <Chip label="rapport.pdf" onRemove={onRemove} removeLabel="Retirer rapport.pdf" />
      </ChipList>,
    );
    const item = within(screen.getByRole('list', { name: 'Fichiers joints' })).getByRole(
      'listitem',
    );
    expect(item).toHaveAttribute('data-slot', 'chip');
    expect(item).toHaveTextContent('rapport.pdf');
    const remove = within(item).getByRole('button', { name: 'Retirer rapport.pdf' });
    expect(remove.parentElement?.closest('button')).toBeNull();
    expect(within(item).getAllByRole('button')).toHaveLength(1);
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('shows a status, a tone and extra actions, and stays static without a remove label', () => {
    render(
      <ChipList aria-label="États">
        <Chip label="photo.png" status="Envoi…" tone="busy" />
        <Chip label="gros.pdf" status="Échec" tone="danger">
          <span>Réessayer</span>
        </Chip>
      </ChipList>,
    );
    const [busy, failed] = screen.getAllByRole('listitem');
    expect(busy).toHaveTextContent('photo.pngEnvoi…');
    expect(busy).toHaveAttribute('data-tone', 'busy');
    expect(within(busy!).queryByRole('button')).toBeNull();
    expect(failed).toHaveAttribute('data-tone', 'danger');
    expect(failed).toHaveTextContent('Réessayer');
  });
});

describe('Breadcrumbs', () => {
  it('is a labelled navigation over an ordered list, with the current page marked', () => {
    render(
      <Breadcrumbs>
        <BreadcrumbItem>
          <a className={breadcrumbLinkClassName} href="/app/files">
            Mes fichiers
          </a>
        </BreadcrumbItem>
        <BreadcrumbItem>
          <a href="/app/files/a">Contrats</a>
        </BreadcrumbItem>
        <BreadcrumbItem current>2026</BreadcrumbItem>
      </Breadcrumbs>,
    );
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    expect(nav).toHaveAttribute('data-slot', 'breadcrumbs');
    const list = within(nav).getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Mes fichiers', 'Contrats']);
    const current = within(nav).getByText('2026');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.closest('a')).toBeNull();
    // Separators are decoration: hidden from assistive technology.
    expect(nav.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });
});
