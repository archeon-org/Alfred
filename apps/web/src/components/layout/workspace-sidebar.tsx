import { Bot, MessageSquareText, PanelRight, PenLine, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';

const navigation = [
  { href: '#conversation', icon: MessageSquareText, label: 'Conversation' },
  { href: '#composer', icon: PenLine, label: 'Composer' },
  { href: '#context-panel', icon: PanelRight, label: 'Contexte' },
] as const;

export function WorkspaceSidebar() {
  return (
    <aside className="border-b border-line bg-panel/90 px-4 py-4 backdrop-blur lg:min-h-dvh lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-4 lg:block">
        <Link
          className="inline-flex min-h-11 items-center gap-3 rounded-xl pr-3 font-bold tracking-[0.16em] text-brand-900 uppercase outline-none focus-visible:ring-3 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          to="/app"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-brand-800 text-white">
            <Bot aria-hidden="true" size={20} />
          </span>
          Alfred
        </Link>
        <Badge className="lg:mt-6">Espace personnel</Badge>
      </div>

      <nav aria-label="Navigation principale" className="mt-4 lg:mt-8">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid">
          {navigation.map(({ href, icon: Icon, label }, index) => (
            <li className="shrink-0" key={href}>
              <a
                aria-current={index === 0 ? 'page' : undefined}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted outline-none transition-colors hover:bg-brand-50 hover:text-ink focus-visible:ring-3 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-panel motion-reduce:transition-none lg:w-full"
                href={href}
              >
                <Icon aria-hidden="true" size={18} />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mt-8 hidden lg:block" aria-labelledby="recent-title">
        <div className="flex items-center justify-between gap-3 px-3">
          <h2
            className="text-xs font-bold tracking-[0.13em] text-muted uppercase"
            id="recent-title"
          >
            Conversations
          </h2>
          <Search aria-hidden="true" className="text-muted" size={15} />
        </div>
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-sm leading-6 text-muted">
          Vos conversations apparaîtront ici après leur chargement.
        </p>
      </section>
    </aside>
  );
}
