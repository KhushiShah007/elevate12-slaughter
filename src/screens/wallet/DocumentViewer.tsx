import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CloudUpload, Download, ExternalLink, Lock, QrCode, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { backUpScan, deleteRemoteDocument, getDocument, getDocumentFiles, openRemoteDocument } from '../../db/repos/documents';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip, SampleTag } from '../../components/ui/Chip';
import { useAuth } from '../../state/auth';
import { useOnline } from '../../hooks/useOnline';
import { ApiError } from '../../api/client';
import { day } from '../../utils/format';
import { useT } from '../../i18n';
import type { TravelDocument } from '../../types';
import NotFound from '../NotFound';

/** A document stored on the account: the phone's copy if kept offline, otherwise a 5-minute link. */
function RemoteView({ doc }: { doc: TravelDocument }) {
  const navigate = useNavigate();
  const online = useOnline();
  const [file, setFile] = useState<{ url: string; local: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    setError(null);
    openRemoteDocument(doc)
      .then((f) => {
        url = f.local ? f.url : null;
        setFile(f);
      })
      .catch((err) => setError(err instanceof ApiError && err.offline ? 'This document is not saved on the phone. Turn on “Available offline” next time you are online.' : 'Could not open the document. Try again.'));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, doc.offline, online]);

  const pdf = doc.mime === 'application/pdf';
  return (
    <>
      {file ? (
        pdf ? (
          <object data={file.url} type="application/pdf" className="aspect-[1/1.35] w-full rounded-md border border-line bg-paper shadow-lift">
            <p className="p-6 text-sm text-espresso">This phone cannot show PDFs inline. Use Open below.</p>
          </object>
        ) : (
          <img src={file.url} alt={doc.title} className="w-full rounded-md border border-line bg-paper shadow-lift" />
        )
      ) : (
        <div className="grid aspect-[1/1.35] place-items-center rounded-md border border-line bg-paper p-6 text-center text-sm text-muted shadow-lift">{error ?? 'Opening…'}</div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {doc.holder && (
          <div>
            <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Holder</dt>
            <dd className="text-ink">{doc.holder}</dd>
          </div>
        )}
        <div>
          <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Number</dt>
          <dd className="font-mono text-ink">{doc.ref}</dd>
        </div>
        {doc.expires && (
          <div>
            <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">Valid until</dt>
            <dd className="text-ink">{day(doc.expires, { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <Lock size={12} className="mt-0.5 shrink-0" /> Encrypted on your account. {file && !file.local && 'This view uses a link that stops working in 5 minutes.'}
      </p>

      {file && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a href={file.url} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-ivory">
            <ExternalLink size={16} /> Open
          </a>
          <a href={file.url} download={`${doc.title}.${pdf ? 'pdf' : (doc.mime ?? 'image/jpeg').split('/')[1]}`} className="flex min-h-tap items-center justify-center gap-2 rounded-pill border border-line bg-paper px-4 text-sm font-medium text-ink">
            <Download size={16} /> Save
          </a>
        </div>
      )}
      <div className="mt-6 text-center">
        {confirm ? (
          <p className="text-sm text-ink">
            Delete from your account and this phone?{' '}
            <button
              className="min-h-tap px-2 font-semibold text-bad underline underline-offset-4"
              onClick={async () => {
                await deleteRemoteDocument(doc);
                navigate('/wallet', { replace: true });
              }}
            >
              Delete
            </button>
            <button className="min-h-tap px-2 text-espresso underline underline-offset-4" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </p>
        ) : (
          <button disabled={!online} onClick={() => setConfirm(true)} className="inline-flex min-h-tap items-center gap-1.5 text-sm text-muted underline underline-offset-4 disabled:opacity-50">
            <Trash2 size={14} /> Delete document
          </button>
        )}
      </div>
    </>
  );
}

export default function DocumentViewer() {
  const { docId } = useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const [backing, setBacking] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
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

  if (doc.remote) {
    return (
      <div className="pb-10">
        <PageHeader back="/wallet" title={doc.title} sub={doc.mime === 'application/pdf' ? 'PDF' : 'Photo'} source="cloud" />
        <div className="px-gutter">
          <RemoteView doc={doc} />
        </div>
      </div>
    );
  }

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
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href={urls!.pdf!} target="_blank" rel="noreferrer" className="flex min-h-tap items-center justify-center gap-2 rounded-pill bg-ink px-4 text-sm font-medium text-ivory">
                <ExternalLink size={16} /> {t('viewer.open')}
              </a>
              <a href={urls!.pdf!} download={`${doc.title}.pdf`} className="flex min-h-tap items-center justify-center gap-2 rounded-pill border border-line bg-paper px-4 text-sm font-medium text-ink">
                <Download size={16} /> {t('viewer.save')}
              </a>
            </div>
            {/* Scans live only on this phone until backed up. */}
            <PillButton
              full
              variant="ghost"
              className="mt-3"
              icon={<CloudUpload size={18} />}
              disabled={!online || backing}
              onClick={async () => {
                setBacking(true);
                setBackupError(null);
                try {
                  const saved = await backUpScan(doc, me?.name ?? doc.holder);
                  navigate(`/wallet/${saved.id}`, { replace: true });
                } catch (err) {
                  setBackupError(err instanceof ApiError ? err.message : 'Backup failed. Please try again.');
                } finally {
                  setBacking(false);
                }
              }}
            >
              {backing ? 'Backing up…' : online ? 'Back up to my account' : 'Back up when online'}
            </PillButton>
            {backupError && <p className="mt-2 text-center text-sm text-bad">{backupError}</p>}
            <p className="mt-2 text-center text-xs text-muted">This scan is only on this phone. Back it up to open it on other devices.</p>
          </>
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
