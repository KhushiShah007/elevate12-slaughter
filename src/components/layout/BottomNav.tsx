import { NavLink } from 'react-router-dom';
import { Home, Luggage, MessageCircleHeart, User, Wallet } from 'lucide-react';

const tabs = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/trips', label: 'Trips', icon: Luggage },
  { to: '/assistant', label: 'Assistant', icon: MessageCircleHeart, centre: true },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/me', label: 'Me', icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="grid h-nav grid-cols-5 items-center rounded-xl border border-line bg-paper/95 shadow-lift backdrop-blur">
        {tabs.map(({ to, label, icon: Icon, centre }) =>
          centre ? (
            <NavLink key={to} to={to} className="flex flex-col items-center" aria-label={label}>
              {({ isActive }) => (
                <>
                  <span
                    className={`-mt-9 grid h-16 w-16 place-items-center rounded-full border-4 border-ivory bg-ink text-ivory shadow-lift transition ${isActive ? 'scale-105' : ''}`}
                  >
                    <Icon size={26} />
                  </span>
                  <span className="mt-0.5 text-[0.6875rem] font-medium text-ink">{label}</span>
                </>
              )}
            </NavLink>
          ) : (
            <NavLink key={to} to={to} className="flex min-h-tap flex-col items-center justify-center gap-1">
              {({ isActive }) => (
                <>
                  <span className={`grid h-8 w-12 place-items-center rounded-pill transition ${isActive ? 'bg-sand' : ''}`}>
                    <Icon size={20} className={isActive ? 'text-ink' : 'text-muted'} />
                  </span>
                  <span className={`text-[0.6875rem] ${isActive ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </div>
    </nav>
  );
}
