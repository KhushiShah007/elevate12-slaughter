import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useOnline } from '../../hooks/useOnline';
import { WifiOff } from 'lucide-react';

/** Phone-width column with the top bar (points pill) and bottom nav. */
export function AppShell() {
  const { pathname } = useLocation();
  const online = useOnline();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="grain mx-auto min-h-screen w-full max-w-app bg-ivory pb-32 shadow-lift">
      <TopBar />
      {!online && (
        <div role="status" className="sticky top-12 z-20 mx-gutter mb-1 flex items-center gap-2 rounded-pill border border-warn/40 bg-butter px-3 py-1.5 text-xs text-ink">
          <WifiOff size={14} className="shrink-0" />
          Offline. Everything on this phone still works; changes sync later.
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

/** Same column without app chrome, for onboarding, the public share page and Judge Mode. */
export function BareShell() {
  return (
    <div className="grain mx-auto min-h-screen w-full max-w-app bg-ivory shadow-lift">
      <Outlet />
    </div>
  );
}
