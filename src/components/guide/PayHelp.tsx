import { CreditCard, ExternalLink, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePoints } from '../../hooks/usePoints';
import { useAuth } from '../../state/auth';
import { redeemFor } from '../../engines/loyalty';
import { bankName, offersLink } from '../../data/cardOffers';
import { inr, num } from '../../utils/format';

/**
 * Ways to pay less for one booking: Voyage points (usable when booking in Voyage) and the
 * offers pages of the traveller's own cards. Never invents a discount.
 */
export function PayHelp({ amount, kind, compact = false }: { amount: number; kind: 'flight' | 'hotel' | 'travel'; compact?: boolean }) {
  const points = usePoints();
  const { me } = useAuth();
  const cards = me?.cards ?? [];
  const balance = points?.total ?? 0;
  const r = redeemFor(balance, amount);

  return (
    <div className={`space-y-1 text-xs ${compact ? '' : 'rounded-md border border-line bg-paper px-3 py-2'}`}>
      <p className="flex items-start gap-1.5 text-espresso">
        <Sparkles size={12} className="mt-0.5 shrink-0" />
        {r.points > 0 ? (
          <span>
            Use {num(r.points)} points: pay <span className="font-semibold text-ink">{inr(r.payInr)}</span> instead of {inr(amount)}{' '}
            <span className="text-muted">(when booking in Voyage)</span>
          </span>
        ) : (
          <span className="text-muted">No points yet. You earn 3% back as points on bookings made in Voyage.</span>
        )}
      </p>
      {cards.length ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-espresso">
          <CreditCard size={12} className="shrink-0" />
          {cards.map((c) => (
            <a key={c.id} href={offersLink(c, kind)} target="_blank" rel="noreferrer" className="inline-flex min-h-[1.75rem] items-center gap-1 underline underline-offset-4">
              {bankName(c.bankId)}
              {c.label ? ` ${c.label}` : ''} offers <ExternalLink size={11} />
            </a>
          ))}
        </p>
      ) : (
        !compact && (
          <p className="flex items-center gap-1.5 text-muted">
            <CreditCard size={12} className="shrink-0" />
            <Link to="/me" className="underline underline-offset-4">
              Add your cards
            </Link>{' '}
            to see where to check card offers.
          </p>
        )
      )}
    </div>
  );
}
