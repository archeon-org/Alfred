import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  readonly path: string;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onPathChange: (value: string) => void;
  readonly onAdd: (file?: File) => Promise<void>;
}
export function SkillFileToolbar({ path, disabled, error, onPathChange, onAdd }: Props) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-3 border-t border-border p-4">
      <label htmlFor={`${id}-path`} className="grid gap-2 text-xs font-medium">
        Chemin du nouveau fichier
        <Input
          id={`${id}-path`}
          disabled={disabled}
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          maxLength={240}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </label>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => void onAdd()}>
        Créer un fichier vide
      </Button>
      <label htmlFor={`${id}-file`} className="grid min-w-0 gap-2 text-xs">
        Joindre un fichier à ce chemin
        <Input
          id={`${id}-file`}
          type="file"
          disabled={disabled}
          className="min-w-0 text-xs"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void onAdd(file);
          }}
        />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
