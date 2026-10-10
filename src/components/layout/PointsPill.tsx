import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { usePoints } from '../../hooks/usePoints';
import { LOYALTY_RATE } from '../../engines/loyalty';
import { inr, num } from '../../utils/format';
import { Sheet } from '../ui/Sheet';
import { Chip } from '../ui/Chip';
import { useT } from '../../i18n';

/** Loyalty points, top-right on every in-app screen. Tap for the breakdown. */
export function PointsPill() {
  const points = usePoints();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (!points) return <span className="min-h-tap" />;
  const { total, spend, entries } = points;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${total} loyalty points. Show breakdown`}
        className="flex min-h-tap items-center"
      >
        {/* Keyed on the total, so a new booking makes the pill thump. */}
        <motion.span
          key={total}
          initial={{ scale: 1.25, rotate: -4 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          className="flex items-center gap-1.5 rounded-pill rounded-l-md border border-ink/10 bg-butter py-1.5 pl-2 pr-3 shadow-card"
        >
          <span className="h-2 w-2 rounded-full border border-ink/30 bg-ivory" />
          <Sparkles size={14} className="text-espresso" />
          <span className="text-sm font-semibold tabular-nums text-ink">{num(total)}</span>
          <span className="text-xs text-espresso">{t('common.pts')}</span>
        </motion.span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Voyage points">
        <div className="rounded-lg border border-line bg-butter p-5">
          <p className="text-sm text-espresso">You have</p>
          <p className="font-display text-5xl text-ink">
            {num(total)} <span className="text-2xl">{t('common.pts')}</span>
          </p>
          <p className="mt-2 text-sm text-espresso">
            {Math.round(LOYALTY_RATE * 100)}% of {inr(spend)} booked through Voyage
          </p>
        </div>

        <h3 className="mb-2 mt-6 text-lg">How you earned them</h3>
        <ul className="divide-y divide-line rounded-md border border-line bg-ivory">
          {entries.map((e) => (
            <li key={e.bookingId} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                <span className="text-xs text-muted">
                  {inr(e.amount)}
                  {e.simulated && ' · simulated'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">+{num(e.points)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Only confirmed bookings made in the app count. Bookings made elsewhere and suggestions you have not
          confirmed do not earn points.
        </p>
        <div className="mt-3">
          <Chip>Sample points, not redeemable</Chip>
        </div>
      </Sheet>
    </>
  );
}
