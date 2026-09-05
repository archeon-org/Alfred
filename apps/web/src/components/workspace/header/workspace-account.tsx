import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { useSession } from '@/hooks/auth/use-session';

export function WorkspaceAccount() {
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

  if (!user) return null;
  return (
    <div className="relative flex items-center gap-1 md:gap-2">
      {logoutError ? (
        <p
          className="absolute top-12 right-0 z-10 w-60 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive shadow-soft"
          role="alert"
        >
          {logoutError}
        </p>
      ) : null}
      <Avatar className="size-8" name={user.displayName} />
      <span className="hidden max-w-28 truncate text-2xs workspace:block">{user.displayName}</span>
      <IconButton
        label="Se déconnecter"
        disabled={isLoggingOut}
        onClick={() => void handleLogout()}
      >
        <LogOut aria-hidden="true" size={16} />
      </IconButton>
    </div>
  );
}
