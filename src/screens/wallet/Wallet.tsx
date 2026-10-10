import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDocuments, setDocumentOffline } from '../../db/repos/documents';
import { PageHeader } from '../../components/layout/PageHeader';
import { DocRow } from '../../components/documents/DocRow';
import { SampleTag } from '../../components/ui/Chip';

export default function Wallet() {
  const [q, setQ] = useState('');
  const documents = useLiveQuery(listDocuments);
  // Goal 6 swaps this simple filter for Fuse.js fuzzy search.

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = documents ?? [];
    return s ? all.filter((d) => `${d.title} ${d.ref} ${d.kind}`.toLowerCase().includes(s)) : all;
  }, [q, documents]);
  if (!documents) return null;
  const offlineCount = documents.filter((d) => d.offline).length;

  return (
    <div>
      <PageHeader title="Wallet" sub={`${offlineCount} of ${documents.length} documents available offline`} right={<SampleTag />} />
      <div className="px-gutter">
        <label className="flex min-h-tap items-center gap-2 rounded-pill border border-line bg-paper px-4 focus-within:border-ink">
          <Search size={18} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search passport, visa, PNR…"
            className="min-h-tap w-full bg-transparent text-base outline-none placeholder:text-muted/70"
          />
        </label>

        <Link to="/wallet/scan" className="mt-4 flex min-h-[4rem] items-center gap-3 rounded-lg border border-ink/5 bg-lavender px-4 shadow-card">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-paper/70">
            <ScanLine size={20} className="text-ink" />
          </span>
          <span>
            <span className="block font-display text-lg leading-tight text-ink">Scan to PDF</span>
            <span className="text-xs text-espresso">Paper ticket, visa or ID</span>
          </span>
        </Link>

        <ul className="mt-5 space-y-3">
          {list.map((d) => (
            <DocRow key={d.id} doc={d} onToggleOffline={(v) => void setDocumentOffline(d.id, v)} />
          ))}
        </ul>
        {!list.length && <p className="mt-6 text-center text-sm text-muted">No documents match “{q}”.</p>}
      </div>
    </div>
  );
}
