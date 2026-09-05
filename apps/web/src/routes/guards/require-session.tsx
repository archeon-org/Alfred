import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useSession } from '@/hooks/auth/use-session';

export function RequireSession() {
  const { refresh, status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main
        className="grid min-h-dvh place-items-center bg-canvas px-5"
        id="main-content"
        tabIndex={-1}
      >
        <div className="text-center" role="status">
          <LoaderCircle
            aria-hidden="true"
            className="mx-auto animate-spin text-brand-700 motion-reduce:animate-none"
            size={30}
          />
          <p className="mt-4 text-sm font-medium text-muted">Restauration de votre session…</p>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main
        className="grid min-h-dvh place-items-center bg-canvas px-5 py-10"
        id="main-content"
        tabIndex={-1}
      >
        <Card className="w-full max-w-md p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-50 text-danger-700">
            <TriangleAlert aria-hidden="true" size={24} />
          </span>
          <h1 className="mt-6 text-2xl font-semibold text-ink">
            Session momentanément indisponible
          </h1>
          <p className="mt-3 text-sm leading-6 text-danger-700" role="alert">
            Alfred ne peut pas restaurer votre session. Votre connexion n’est pas considérée comme
            fermée : réessayez lorsque le service répond de nouveau.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => void refresh().catch(() => undefined)}
            variant="outline"
          >
            Réessayer
          </Button>
        </Card>
      </main>
    );
  }

  if (status === 'anonymous') {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace state={{ from }} to="/login" />;
  }

  return <Outlet />;
}
