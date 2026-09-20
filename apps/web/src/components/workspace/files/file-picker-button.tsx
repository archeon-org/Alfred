import { useRef, type ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FILE_INPUT_ACCEPT } from '@/lib/files/file-kinds';

interface FilePickerButtonProps extends Omit<ButtonProps, 'onClick' | 'type'> {
  /** Accessible name of the hidden file input, distinct from the button's own name. */
  readonly inputLabel: string;
  readonly onFiles: (files: File[]) => void;
  readonly children: ReactNode;
}

/**
 * A button in front of a native, labelled `<input type="file" multiple>`: the browser's own
 * picker, restricted to the accepted formats. The input is emptied after each choice so that
 * picking the same file twice in a row still reports it.
 */
export function FilePickerButton({
  children,
  disabled,
  inputLabel,
  onFiles,
  ...button
}: FilePickerButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...button} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <Input
        accept={FILE_INPUT_ACCEPT}
        aria-label={inputLabel}
        className="hidden"
        disabled={disabled}
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
        ref={input}
        type="file"
      />
    </>
  );
}
