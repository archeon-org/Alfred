import { Bot, CheckCircle2, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuthProvidersQuery } from '@/hooks/auth/use-auth-providers-query';
import { useSession } from '@/hooks/auth/use-session';
import { cn } from '@/lib/cn';
import { getProviderLoginUrl, safeReturnTo } from '@/services/auth/auth.service';

const assurances = [
  'Session restaurée par cookie sécurisé',
  "Jeton d'accès conservé uniquement en mémoire",
  'Accès aux espaces contrôlé côté serveur',
] as const;

function isLoginLocationState(value: unknown): value is { readonly from: string } {
  return (
    typeof value === 'object' && value !== null && 'from' in value && typeof value.from === 'string'
  );
}

export function LoginScreen() {
  const { refresh, status } = useSession();
  const authProviders = useAuthProvidersQuery();
  const location = useLocation();
  const locationState: unknown = location.state;
  const requestedRoute = isLoginLocationState(locationState) ? locationState.from : null;
  const returnTo = safeReturnTo(requestedRoute);

  if (status === 'authenticated') {
    return <Navigate replace to={returnTo} />;
  }

  return (
    <main
      className="relative grid min-h-dvh overflow-hidden bg-canvas px-5 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] lg:px-10"
      id="main-content"
      tabIndex={-1}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 -top-36 size-[30rem] rounded-full bg-accent/70 blur-3xl"
      />

      <section className="relative flex flex-col justify-between gap-14 px-1 py-4 sm:px-5 lg:px-10 lg:py-10">
        <div className="flex items-center gap-3 text-sm font-bold tracking-[0.18em] text-foreground uppercase">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Bot aria-hidden="true" size={20} />
          </span>
          Alfred
        </div>

        <div className="max-w-2xl">
          <Badge className="mb-6 gap-2">
            <Sparkles aria-hidden="true" size={14} />
            Espace agentique sécurisé
          </Badge>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-6xl">
            Bienvenue sur Alfred
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Retrouvez vos conversations, composez votre équipe d’agents et gardez le contrôle sur
            chaque action depuis un espace de travail unique.
          </p>

          <ul className="mt-9 grid gap-4 text-sm text-foreground" aria-label="Garanties de session">
            {assurances.map((assurance) => (
              <li className="flex items-center gap-3" key={assurance}>
                <CheckCircle2 aria-hidden="true" className="text-primary" size={18} />
                {assurance}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Alfred ne conserve ni jeton d’accès ni contenu de conversation dans le stockage du
          navigateur.
        </p>
      </section>

      <section
        className="relative flex items-center justify-center py-5 lg:py-10"
        aria-label="Connexion"
      >
        <Card className="w-full max-w-md p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <ShieldCheck aria-hidden="true" size={24} />
          </span>
          <h2 className="mt-7 text-2xl font-semibold tracking-tight text-foreground">
            Ouvrir votre espace
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Utilisez le fournisseur autorisé par la configuration de votre environnement Alfred.
          </p>

          <div className="mt-7" aria-live="polite">
            {status === 'loading' ||
            (status === 'anonymous' && authProviders.status === 'loading') ? (
              <div
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                  size={17}
                />
                Vérification de la connexion…
              </div>
            ) : null}

            {status === 'error' ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm leading-6 text-destructive">
                  Impossible de vérifier votre session pour le moment.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void refresh().catch(() => undefined)}
                  type="button"
                >
                  Réessayer
                </Button>
              </div>
            ) : null}

            {status === 'anonymous' &&
            authProviders.status === 'ready' &&
            authProviders.providers.length > 0 ? (
              <div className="grid gap-3">
                {authProviders.providers.map((provider) => (
                  <a
                    className={cn(buttonVariants(), 'w-full')}
                    href={getProviderLoginUrl(provider.id, returnTo)}
                    key={provider.id}
                  >
                    Continuer avec {provider.displayName}
                  </a>
                ))}
              </div>
            ) : null}

            {status === 'anonymous' &&
            authProviders.status === 'ready' &&
            authProviders.providers.length === 0 ? (
              <div className="rounded-xl border border-border bg-canvas px-4 py-3 text-sm leading-6 text-muted-foreground">
                Aucun fournisseur de connexion n’est configuré sur cet environnement.
              </div>
            ) : null}

            {status === 'anonymous' && authProviders.status === 'error' ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm leading-6 text-destructive">
                  Impossible de vérifier les fournisseurs de connexion.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void authProviders.reload()}
                  type="button"
                >
                  Réessayer
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      </section>
    </main>
  );
}
