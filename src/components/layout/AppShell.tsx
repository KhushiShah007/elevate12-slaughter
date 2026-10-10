import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';

/** Phone-width column with the top bar (points pill) and bottom nav. */
export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="grain mx-auto min-h-screen w-full max-w-app bg-ivory pb-32 shadow-lift">
      <TopBar />
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
