import { ArrowRight } from 'lucide-react';
import type { RecoveryOption } from '../../types';

/** Old vs new after a recheck. Changed rows are highlighted. */
export function RecheckDiff({ rows }: { rows: RecoveryOption['recheck'] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-paper">
      {rows.map((r) => (
        <li key={r.field} className={`px-4 py-3 ${r.changed ? 'bg-butter/60' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">{r.field}</p>
            {r.changed && <span className="text-[0.625rem] font-bold uppercase tracking-widest text-espresso">Changed</span>}
          </div>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span className={r.changed ? 'text-muted line-through' : 'text-espresso'}>{r.before}</span>
            <ArrowRight size={14} className="text-muted" />
            <span className="font-semibold text-ink">{r.after}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
