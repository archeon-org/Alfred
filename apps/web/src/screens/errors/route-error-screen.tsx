import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { WorkspaceNotice } from '@/components/workspace/workspace-notice';
import { NotFoundScreen } from '@/screens/errors/not-found-screen';

function describeRouteError(error: unknown): { title: string; message: string } {
  if (isRouteErrorResponse(error)) {
    return {
      message: error.statusText || 'Le serveur a renvoyé une réponse inattendue.',
      title: `Erreur ${error.status}`,
    };
  }
  if (import.meta.env.DEV && error instanceof Error) {
    return { message: error.message, title: 'Une erreur est survenue' };
  }
  return {
    message: 'Alfred n’a pas pu afficher cette page. Réessayez ou revenez à l’accueil.',
    title: 'Une erreur est survenue',
  };
}

/** Full-page fallback for errors thrown outside the workspace shell. */
export function RouteErrorScreen() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />;
  const { message, title } = describeRouteError(error);
  return (
    <main
      className="grid min-h-dvh place-items-center bg-canvas px-5 text-center"
      id="main-content"
      tabIndex={-1}
    >
      <div role="alert">
        <p className="text-sm font-bold tracking-[0.15em] text-primary uppercase">Alfred</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => window.location.reload()} type="button">
            Recharger la page
          </Button>
          <Link className={buttonVariants({ variant: 'outline' })} to="/app">
            Retour à l’accueil
          </Link>
        </div>
      </div>
    </main>
  );
}

/** Fallback rendered inside the workspace frame so the sidebar and header stay usable. */
export function WorkspaceErrorScreen() {
  const error = useRouteError();
  const { message, title } = describeRouteError(error);
  return (
    <WorkspaceNotice
      action={
        <Link className={buttonVariants({ variant: 'outline' })} to="/app">
          Retour à l’accueil
        </Link>
      }
      message={message}
      title={title}
      tone="error"
    />
  );
}
