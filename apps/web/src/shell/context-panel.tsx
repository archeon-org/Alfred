import { Bot, FileText, ShieldCheck } from 'lucide-react';

import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';

const contextItems = [
  { icon: Bot, label: 'Agents', value: 'Automatique' },
  { icon: FileText, label: 'Documents', value: 'Aucun' },
  { icon: ShieldCheck, label: 'Approbations', value: 'Requises' },
] as const;

export function ContextPanel() {
  return (
    <aside
      aria-label="Contexte de la conversation"
      className="border-t border-line bg-panel px-5 py-6 lg:col-span-2 xl:col-span-1 xl:min-h-dvh xl:border-t-0 xl:border-l"
      id="context-panel"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Panneau droit</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Contexte</h2>
        </div>
        <Badge>Privé</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        Les ressources et contrôles de la conversation active seront regroupés ici.
      </p>

      <Separator className="my-6" />

      <dl className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1">
        {contextItems.map(({ icon: Icon, label, value }) => (
          <div className="flex items-center gap-3" key={label}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
              <Icon aria-hidden="true" size={18} />
            </span>
            <div>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </aside>
  );
}
