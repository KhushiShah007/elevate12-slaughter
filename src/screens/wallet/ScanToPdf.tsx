import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, FileText, Plus, X } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Input } from '../../components/ui/Input';
import { useTraveller } from '../../hooks/useTrip';
import { imageToJpeg, type JpegPage } from '../../utils/image';
import { saveScan } from '../../db/repos/documents';
import { useT } from '../../i18n';

export default function ScanToPdf() {
  const navigate = useNavigate();
  const { t } = useT();
  const traveller = useTraveller();
  const [pages, setPages] = useState<JpegPage[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview URLs for the page thumbnails, released when pages change.
  const previews = useMemo(() => pages.map((p) => URL.createObjectURL(p.blob)), [pages]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const converted = await Promise.all([...files].map((f) => imageToJpeg(f)));
      setPages((p) => [...p, ...converted].slice(0, 20));
    } catch {
      setError(t('scan.failed'));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const doc = await saveScan(name || t('scan.defaultName'), traveller?.name ?? '', pages);
      navigate(`/wallet/${doc.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader back title={t('scan.title')} sub={t('scan.sub')} />
      <div className="space-y-5 px-gutter">
        {/* On phones, capture="environment" opens the back camera straight away. */}
        <label className="flex min-h-[9rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-ink/20 bg-lavender/60 p-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-ivory shadow-lift">{pages.length ? <Plus size={26} /> : <Camera size={26} />}</span>
          <span className="font-display text-lg text-ink">{pages.length ? t('scan.addMore') : t('scan.add')}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}

        {pages.length > 0 && (
          <>
            <ol className="no-scrollbar -mx-gutter flex gap-3 overflow-x-auto px-gutter pb-2">
              {previews.map((src, i) => (
                <li key={src} className="relative shrink-0">
                  <img src={src} alt="" className="h-36 w-28 rounded-sm border border-line bg-paper object-cover shadow-card" />
                  <span className="absolute bottom-1 left-1 rounded-pill bg-ink/80 px-2 text-xs text-ivory">{i + 1}</span>
                  <button
                    onClick={() => setPages((p) => p.filter((_, n) => n !== i))}
                    aria-label={t('scan.remove', { n: i + 1 })}
                    className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-ink shadow-card"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ol>

            <Input label={t('scan.name')} icon={<FileText size={18} />} placeholder={t('scan.defaultName')} value={name} onChange={(e) => setName(e.target.value)} />

            <PillButton full disabled={busy} onClick={() => void save()}>
              {busy ? t('scan.saving') : pages.length === 1 ? t('scan.saveOne') : t('scan.save', { n: pages.length })}
            </PillButton>
          </>
        )}
        <p className="text-center text-xs text-muted">{t('scan.local')}</p>
      </div>
    </div>
  );
}
