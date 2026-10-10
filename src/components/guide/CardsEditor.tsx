import { useState } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../state/auth';
import { BANKS, NETWORKS, bankName, type SavedCard } from '../../data/cardOffers';
import { ApiError } from '../../api/client';

/** The traveller's cards, by bank and network only, so offers can be pointed out. */
export function CardsEditor() {
  const { me, saveProfile } = useAuth();
  const cards = me?.cards ?? [];
  const [adding, setAdding] = useState(false);
  const [bankId, setBankId] = useState('hdfc');
  const [network, setNetwork] = useState<SavedCard['network']>('Visa');
  const [kind, setKind] = useState<SavedCard['kind']>('credit');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (next: SavedCard[]) => {
    setError(null);
    try {
      await saveProfile({ cards: next });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Could not save. Try again.');
      return false;
    }
  };

  const select = 'min-h-tap w-full rounded-md border border-line bg-paper px-3 text-base text-ink outline-none focus:border-ink';

  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-lg">
        <CreditCard size={18} /> My cards
      </h2>
      <p className="mt-1 text-xs text-muted">Only the bank and card type, never the number. We point you to that bank's travel offers.</p>
      <ul className="mt-3 space-y-2">
        {cards.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
            <span>
              <span className="font-medium text-ink">{bankName(c.bankId)}</span> · {c.network} {c.kind}
              {c.label && <span className="text-muted"> · {c.label}</span>}
            </span>
            <button onClick={() => void save(cards.filter((x) => x.id !== c.id))} aria-label={`Remove ${bankName(c.bankId)} card`} className="grid min-h-tap min-w-[2.75rem] place-items-center text-muted">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-3 space-y-3">
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={select} aria-label="Bank">
            {BANKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={network} onChange={(e) => setNetwork(e.target.value as SavedCard['network'])} className={select} aria-label="Network">
              {NETWORKS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as SavedCard['kind'])} className={select} aria-label="Credit or debit">
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Nickname, e.g. Regalia (optional)" className={select} aria-label="Nickname" />
          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (await save([...cards, { id: crypto.randomUUID(), bankId, network, kind, label: label.trim() }])) {
                  setAdding(false);
                  setLabel('');
                }
              }}
              className="min-h-tap flex-1 rounded-pill bg-ink px-4 text-sm font-medium text-ivory"
            >
              Save card
            </button>
            <button onClick={() => setAdding(false)} className="min-h-tap rounded-pill border border-line px-4 text-sm text-ink">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        cards.length < 10 && (
          <button onClick={() => setAdding(true)} className="mt-3 flex min-h-tap items-center gap-1.5 text-sm font-medium text-ink underline underline-offset-4">
            <Plus size={16} /> Add a card
          </button>
        )
      )}
    </section>
  );
}
