import { useNavigate } from 'react-router-dom';
import { useLongPress } from '../../hooks/useLongPress';
import { PointsPill } from './PointsPill';

/** App-wide bar: wordmark (long-press opens Judge Mode) and the points pill. */
export function TopBar() {
  const navigate = useNavigate();
  const press = useLongPress(() => navigate('/judge'));

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-ivory/90 px-gutter pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <button {...press} className="flex min-h-tap select-none items-center gap-2" aria-label="Voyage">
        <span className="grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-dashed border-espresso/60 font-display text-sm italic text-espresso">
          V
        </span>
        <span className="font-display text-xl italic text-ink">Voyage</span>
      </button>
      <PointsPill />
    </header>
  );
}
