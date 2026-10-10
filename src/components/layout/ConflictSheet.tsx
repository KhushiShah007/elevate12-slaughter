import { Cloud, Smartphone } from 'lucide-react';
import type { SyncEntry } from '../../types';
import { resolveConflict } from '../../db/syncQueue';
import { Sheet } from '../ui/Sheet';
import { PillButton } from '../ui/PillButton';
import { Chip } from '../ui/Chip';
import { inr, localTime } from '../../utils/format';

/** Show a payload as a few readable lines instead of raw JSON. */
function describe(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Deleted';
  const p = payload as Record<string, unknown>;
  if ('offline' in p) return `Available offline: ${p.offline ? 'on' : 'off'}`;
  if ('doneAt' in p) return `Done at ${localTime(String(p.doneAt))}`;
  if ('amount' in p) return `${p.title} · ${inr(Number(p.amount))}`;
  if ('name' in p) return String(p.name);
  return 'Updated';
}

/** The user decides which version to keep. Nothing is overwritten silently. */
export function ConflictSheet({ open, onClose, conflicts }: { open: boolean; onClose: () => void; conflicts: SyncEntry[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Which version?">
      <p className="text-sm leading-relaxed text-espresso">
        You changed these on this phone, but the same item was also changed on another device. Pick which version to keep for each.
      </p>
      <div className="mt-2">
        <Chip>Simulated server</Chip>
      </div>
      <ul className="mt-5 space-y-4">
        {conflicts.map((c) => (
          <li key={c.seq} className="rounded-lg border border-line bg-ivory p-4">
            <p className="font-display text-lg leading-tight text-ink">{c.label}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-line bg-paper p-3">
                <p className="mb-1 flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
                  <Smartphone size={12} /> This phone
                </p>
                <p className="text-ink">{describe(c.payload)}</p>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <p className="mb-1 flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
                  <Cloud size={12} /> Other device
                </p>
                <p className="text-ink">{describe(c.serverPayload)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <PillButton small onClick={() => void resolveConflict(c.seq!, 'mine')}>
                Keep mine
              </PillButton>
              <PillButton small variant="ghost" onClick={() => void resolveConflict(c.seq!, 'theirs')}>
                Keep other
              </PillButton>
            </div>
          </li>
        ))}
      </ul>
      {!conflicts.length && <p className="mt-6 text-center text-sm text-muted">All sorted. Nothing left to choose.</p>}
    </Sheet>
  );
}
