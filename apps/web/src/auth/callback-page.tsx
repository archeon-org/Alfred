import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { buttonVariants } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { safeReturnTo } from './auth-api';
import { useSession } from './use-session';

export function CallbackPage() {
  const { refresh, status } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const attempted = useRef(false);
  const providerError = searchParams.has('error');
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [failed, setFailed] = useState(providerError);

  useEffect(() => {
    if (providerError || status === 'loading' || attempted.current) {
      return;
    }
    if (status === 'authenticated') {
      void navigate(returnTo, { replace: true });
      return;
    }

    attempted.current = true;
    void refresh().then((restored) => {
      if (restored !== null) {
        void navigate(returnTo, { replace: true });
      } else {
        setFailed(true);
      }
    });
  }, [navigate, providerError, refresh, returnTo, status]);

  if (status === 'authenticated') {
    return <Navigate replace to={returnTo} />;
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5 py-10" id="main-content">
      <Card className="w-full max-w-md p-8 text-center">
        {failed ? (
          <>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-50 text-danger-700">
              <TriangleAlert aria-hidden="true" size={24} />
            </span>
            <h1 className="mt-6 text-2xl font-semibold text-ink">Connexion non finalisée</h1>
            <p className="mt-3 text-sm leading-6 text-muted" role="alert">
              Votre session n’a pas pu être restaurée. Aucun jeton n’a été conservé sur cet
              appareil.
            </p>
            <Link className={buttonVariants({ variant: 'outline' })} to="/login">
              Revenir à la connexion
            </Link>
          </>
        ) : (
          <div role="status">
            <LoaderCircle
              aria-hidden="true"
              className="mx-auto animate-spin text-brand-700 motion-reduce:animate-none"
              size={30}
            />
            <h1 className="mt-6 text-2xl font-semibold text-ink">Connexion en cours</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Nous restaurons votre session sécurisée avant d’ouvrir Alfred.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}
