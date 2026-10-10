import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ExternalLink, QrCode } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDocument, getDocumentFiles } from '../../db/repos/documents';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { day } from '../../utils/format';
import { useT } from '../../i18n';
import NotFound from '../NotFound';

export default function DocumentViewer() {
  const { docId } = useParams();
  const { t } = useT();
  const doc = useLiveQuery(async () => (docId ? ((await getDocument(docId)) ?? null) : null), [docId]);
  const files = useLiveQuery(async () => (docId ? getDocumentFiles(docId) : null), [docId]);

  // Object URLs for the stored PDF and page images (scanned documents only).
  const urls = useMemo(
    () => (files ? { pdf: files.pdf ? URL.createObjectURL(files.pdf) : null, pages: files.pages.map((b) => URL.createObjectURL(b)) } : null),
    [files],
  );
  useEffect(() => () => {
    if (urls?.pdf) URL.revokeObjectURL(urls.pdf);
    urls?.pages.forEach((u) => URL.revokeObjectURL(u));
  }, [urls]);

  if (doc === undefined) return null;
  if (!doc) return <NotFound />;
  const real = !!doc.hasFile && !!urls?.pdf;

  return (
    <div>
      <PageHeader back title={doc.title} sub={`${doc.pages} ${doc.pages === 1 ? 'page' : 'pages'} · PDF`} right={real ? undefined : <SampleTag />} />
      <div className="px-gutter">
        {real ? (
          <div className="space-y-3">
            {urls!.pages.map((src, i) => (
              <figure key={src}>
                <img src={src} alt={t('viewer.page', { n: i + 1, total: doc.pages })} className="w-full rounded-md border border-line bg-paper shadow-lift" />
                <figcaption className="mt-1 text-right text-xs text-muted">{t('viewer.page', { n: i + 1, total: doc.pages })}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
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
        )}

        <div className="mt-4">
          {doc.offline ? (
            <Chip tone="ok" dot>
              Available offline
            </Chip>
          ) : (
            <Chip tone="warn" dot>
              Needs internet to open
            </Chip>
          )}
        </div>

        {real ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href={urls!.pdf!} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-ivory">
              <ExternalLink size={16} /> {t('viewer.open')}
            </a>
            <a href={urls!.pdf!} download={`${doc.title}.pdf`} className="flex min-h-tap items-center justify-center gap-2 rounded-pill border border-line bg-paper px-4 text-sm font-medium text-ink">
              <Download size={16} /> {t('viewer.save')}
            </a>
          </div>
        ) : (
          <>
            <PillButton full variant="ghost" className="mt-4" icon={<Download size={18} />} disabled>
              {t('viewer.save')}
            </PillButton>
            <p className="mt-2 text-center text-xs text-muted">{t('viewer.sample')}</p>
          </>
        )}
      </div>
    </div>
  );
}
