import { LogOut, Wifi } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/auth/use-session';

export function WorkspaceHeader() {
  const { logout, user } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Déconnexion impossible. Votre session reste active.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex min-h-20 items-center justify-between gap-4 border-b border-line bg-panel/80 px-4 backdrop-blur sm:px-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Workspace</p>
        <div className="mt-1 flex items-center gap-2 text-sm text-brand-800" role="status">
          <Wifi aria-hidden="true" size={15} />
          Interface prête
        </div>
      </div>

      {user ? (
        <div className="flex items-center gap-2 sm:gap-3">
          {logoutError ? (
            <p className="text-danger-700 max-w-52 text-right text-xs" role="alert">
              {logoutError}
            </p>
          ) : null}
          <Avatar name={user.displayName} />
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold text-ink">{user.displayName}</p>
            <p className="max-w-48 truncate text-xs text-muted">{user.email}</p>
          </div>
          <Button
            aria-label="Se déconnecter"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            size="icon"
            title="Se déconnecter"
            variant="ghost"
          >
            <LogOut aria-hidden="true" size={18} />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
