import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

export function RouteFocusManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
  }, [pathname]);

  return <Outlet />;
}
