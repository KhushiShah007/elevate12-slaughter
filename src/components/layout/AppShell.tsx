import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../state/auth';
import { useEffect } from 'react';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { useOnline } from '../../hooks/useOnline';
import { WifiOff } from 'lucide-react';
import { useT } from '../../i18n';

/** Phone-width column with the top bar (points pill) and bottom nav. */
import { AckStrip } from './AckStrip';

export function AppShell() {
  const { pathname } = useLocation();
  const online = useOnline();
  const { t } = useT();
  const { status } = useAuth();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // In-app screens need an account. While the session is being checked, show nothing.
  if (status === 'signedOut') return <Navigate to="/welcome" replace />;
  if (status === 'loading') return <div className="mx-auto min-h-screen w-full max-w-app bg-ivory" />;

  return (
    <div className="grain mx-auto min-h-screen w-full max-w-app bg-ivory pb-32 shadow-lift">
      <TopBar />
      {!online && (
        <div role="status" className="sticky top-12 z-20 mx-gutter mb-1 flex items-center gap-2 rounded-pill border border-warn/40 bg-butter px-3 py-1.5 text-xs text-ink">
          <WifiOff size={14} className="shrink-0" />
          {t('common.offlineBanner')}
        </div>
      )}
      <AckStrip />
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
