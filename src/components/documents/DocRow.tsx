import { Link } from 'react-router-dom';
import { BadgeCheck, FileText, Hotel, IdCard, Plane, ShieldCheck, Stamp } from 'lucide-react';
import type { DocumentKind, TravelDocument } from '../../types';
import { pastelBg, type Pastel } from '../../design/tokens';
import { Toggle } from '../ui/Toggle';
import { useT } from '../../i18n';

const look: Record<DocumentKind, { Icon: typeof FileText; pastel: Pastel }> = {
  passport: { Icon: BadgeCheck, pastel: 'rose' },
  visa: { Icon: Stamp, pastel: 'lavender' },
  'boarding-pass': { Icon: Plane, pastel: 'sky' },
  insurance: { Icon: ShieldCheck, pastel: 'mint' },
  hotel: { Icon: Hotel, pastel: 'peach' },
  id: { Icon: IdCard, pastel: 'butter' },
  other: { Icon: FileText, pastel: 'butter' },
};

/** One document: opens the viewer; the switch keeps it available offline. */
export function DocRow({ doc, onToggleOffline }: { doc: TravelDocument; onToggleOffline: (v: boolean) => void }) {
  const { Icon, pastel } = look[doc.kind];
  const { t } = useT();
  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-paper py-2 pl-3 pr-1 shadow-card">
      <Link to={`/wallet/${doc.id}`} className="flex min-h-tap min-w-0 flex-1 items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-sm ${pastelBg[pastel]}`}>
          <Icon size={20} className="text-ink" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{doc.title}</span>
          <span className="block truncate text-xs text-muted">
            {doc.ref} · {doc.pages} {doc.pages === 1 ? 'page' : 'pages'}
          </span>
        </span>
      </Link>
      <div className="flex shrink-0 flex-col items-center">
        <Toggle checked={doc.offline} onChange={onToggleOffline} label={`Keep ${doc.title} available offline`} />
        <span className="-mt-2 text-[0.5625rem] font-semibold uppercase tracking-wider text-muted">{t('wallet.offline')}</span>
      </div>
    </li>
  );
}
