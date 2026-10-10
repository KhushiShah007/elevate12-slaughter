import { useParams } from 'react-router-dom';
import { Download, QrCode } from 'lucide-react';
import { documents } from '../../data/sampleDocuments';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { day } from '../../utils/format';
import NotFound from '../NotFound';

export default function DocumentViewer() {
  const { docId } = useParams();
  const doc = documents.find((d) => d.id === docId);
  if (!doc) return <NotFound />;

  return (
    <div>
      <PageHeader back title={doc.title} sub={`${doc.pages} ${doc.pages === 1 ? 'page' : 'pages'} · PDF`} right={<SampleTag />} />
      <div className="px-gutter">
        {/* Prototype preview of page 1. Goal 6 renders the real PDF. */}
        <div className="grain aspect-[1/1.35] rounded-md border border-line bg-paper p-6 shadow-lift">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-muted">{doc.kind.replace('-', ' ')}</p>
              <p className="mt-1 font-display text-2xl text-ink">{doc.title}</p>
            </div>
            <QrCode size={56} strokeWidth={1.25} className="text-ink" />
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
            <div>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Holder</dt>
              <dd className="text-ink">{doc.holder}</dd>
            </div>
            <div>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Reference</dt>
              <dd className="text-ink">{doc.ref}</dd>
            </div>
            {doc.expires && (
              <div>
                <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Valid until</dt>
                <dd className="text-ink">{day(doc.expires, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
            )}
          </dl>
          <div className="mt-10 space-y-2">
            {[100, 92, 96, 70, 88, 60].map((w, i) => (
              <div key={i} className="h-2 rounded-full bg-sand" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {doc.offline ? (
            <Chip tone="ok" dot>
              Available offline
            </Chip>
          ) : (
            <Chip tone="warn" dot>
              Needs internet to open
            </Chip>
          )}
          <span className="text-xs text-muted">Page 1 of {doc.pages}</span>
        </div>
        <PillButton full variant="ghost" className="mt-4" icon={<Download size={18} />}>
          Save a copy
        </PillButton>
      </div>
    </div>
  );
}
