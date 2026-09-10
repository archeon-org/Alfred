import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SourceEditor } from '@/components/ui/source-editor';

function Example() {
  const [text, setText] = useState('def run():\n    return 1');
  return (
    <>
      <SourceEditor label="Code source" value={text} onChange={setText} />
      <button>Suivant</button>
    </>
  );
}
describe('Source editor', () => {
  it('edits multiline source without trapping keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const source = screen.getByRole('textbox', { name: 'Code source' });
    await user.click(source);
    await user.keyboard('{Control>}End{/Control}{Enter}# note');
    expect(source).toHaveValue('def run():\n    return 1\n# note');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Suivant' })).toHaveFocus();
  });
});
