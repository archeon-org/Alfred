import { Link } from 'react-router-dom';

import { buttonVariants } from '@/components/ui/button';

export function NotFoundScreen() {
  return (
    <main
      className="grid min-h-dvh place-items-center bg-canvas px-5 text-center"
      id="main-content"
      tabIndex={-1}
    >
      <div>
        <p className="text-sm font-bold tracking-[0.15em] text-brand-800 uppercase">Erreur 404</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Cette page n’existe pas</h1>
        <p className="mt-3 text-sm text-muted">Revenez à l’entrée sécurisée d’Alfred.</p>
        <Link className={buttonVariants({ variant: 'outline' })} to="/">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
