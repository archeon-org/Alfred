import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

describe('shared form controls', () => {
  it('keeps action buttons from submitting their enclosing form', async () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick}>Ajouter</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports a label, space key and native form value for checkboxes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <form>
        <label htmlFor="analyst">
          <Checkbox id="analyst" name="agent" value="analyst" onChange={onChange} />
          Analyste
        </label>
      </form>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Analyste' });
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(' ');
    expect(checkbox).toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (form) expect(new FormData(form).get('agent')).toBe('analyst');
  });

  it('retains disabled behavior and forwards textarea validation attributes', async () => {
    render(
      <>
        <Checkbox aria-label="Désactivé" disabled />
        <Textarea aria-label="Instructions" aria-invalid="true" maxLength={10} />
      </>,
    );
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    const textarea = screen.getByRole('textbox', { name: 'Instructions' });
    await userEvent.type(textarea, '01234567890');
    expect(textarea).toHaveValue('0123456789');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });
});
