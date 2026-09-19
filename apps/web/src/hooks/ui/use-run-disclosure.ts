import { useState, type SyntheticEvent } from 'react';

export interface RunDisclosure {
  readonly open: boolean;
  readonly onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}

/**
 * Open state of a `<details>` that follows a unit of work: open while it runs, folded once it
 * ends, unless the person toggled it during the run. Work already finished when it appears
 * starts folded. The state follows the run during render, without an effect.
 */
export function useRunDisclosure(running: boolean): RunDisclosure {
  const [open, setOpen] = useState(running);
  const [wasRunning, setWasRunning] = useState(running);
  const [toggled, setToggled] = useState(false);
  if (wasRunning !== running) {
    setWasRunning(running);
    if (!toggled) setOpen(running);
  }
  return {
    open,
    onToggle: (event) => {
      const next = event.currentTarget.open;
      // React hands a row the toggles of rows nested in it, and the browser echoes the open state
      // the run set: neither is the person's choice.
      if (event.target !== event.currentTarget || next === open) return;
      setOpen(next);
      setToggled(true);
    },
  };
}
