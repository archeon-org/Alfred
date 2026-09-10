import { useId, useRef } from 'react';
import { Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  readonly search: string;
  readonly pending: boolean;
  readonly onSearch: (value: string) => void;
  readonly onCreate: () => void;
  readonly onImport: (file: File) => void;
}

export function SkillsCatalogueToolbar({ search, pending, onSearch, onCreate, onImport }: Props) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
        <label htmlFor={id} className="sr-only">
          Rechercher un skill
        </label>
        <Search
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          className="pl-9"
          placeholder="Rechercher un skill…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label="Importer Markdown ou ZIP"
        onClick={() => fileInput.current?.click()}
      >
        <Upload aria-hidden="true" size={16} /> Importer
      </Button>
      <Input
        ref={fileInput}
        type="file"
        hidden
        className="hidden"
        aria-label="Fichier Markdown ou ZIP"
        accept=".md,.zip,text/markdown,application/zip"
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onImport(file);
        }}
      />
      <Button size="sm" disabled={pending} onClick={onCreate}>
        <Plus aria-hidden="true" size={16} /> Créer un skill
      </Button>
    </div>
  );
}
