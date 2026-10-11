import { useEffect, useRef, useState } from 'react';
import { EyeOff, Loader2, Undo2 } from 'lucide-react';
import { analyse, buildMasked, maskedCanvas, summaryOf, type MaskPage } from '../../utils/mask';
import { KIND_LABEL, type SensitiveKind } from '../../engines/redact';

export interface MaskResult {
  blob: Blob;
  mime: string;
  summary: Record<string, number>;
}

/**
 * Finds and blacks out sensitive details on the device, with a before/after preview.
 * Drag on the page to cover anything that was missed.
 */
export function MaskEditor({ file, mime, onDone, onCancel, saveLabel = 'Use masked copy' }: { file: Blob; mime: string; onDone: (r: MaskResult) => void; onCancel?: () => void; saveLabel?: string }) {
  const [pages, setPages] = useState<MaskPage[] | null>(null);
  const [progress, setProgress] = useState('Preparing…');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'after' | 'before'>('after');
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    setPages(null);
    setError(null);
    analyse(file, mime, (m) => alive && setProgress(m))
      .then((p) => alive && setPages(p))
      .catch(() => alive && setError('Could not read this file on your phone. You can still save it without masking.'));
    return () => {
      alive = false;
    };
  }, [file, mime]);

  if (error) return <p className="text-sm text-bad">{error}</p>;
  if (!pages)
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <Loader2 size={16} className="animate-spin" /> {progress} Everything stays on this phone.
      </p>
    );

  const counts = summaryOf(pages);
  const found = Object.entries(counts).filter(([, n]) => n) as [SensitiveKind | 'manual', number][];
  const save = async () => {
    setBusy(true);
    try {
      const out = await buildMasked(pages, mime);
      onDone({ ...out, summary: counts as Record<string, number> });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-line bg-paper px-4 py-3 text-sm">
        {found.length ? (
          <>
            <span className="font-medium text-ink">Hidden:</span>{' '}
            {found.map(([k, n]) => `${k === 'manual' ? 'Areas you covered' : KIND_LABEL[k]}${n > 1 ? ` ×${n}` : ''}`).join(', ')}
          </>
        ) : (
          <span className="text-espresso">We did not find an ID number, birth date or address. Drag over anything you want to hide.</span>
        )}
        {pages.some((p) => p.ocr) && <span className="mt-1 block text-xs text-muted">Read from the image (OCR): check the preview carefully.</span>}
      </div>
      <div className="flex gap-2">
        {(['after', 'before'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`min-h-tap flex-1 rounded-pill border border-line text-sm ${view === v ? 'bg-ink text-paper' : 'bg-paper text-ink'}`}>
            {v === 'after' ? 'Masked' : 'Original'}
          </button>
        ))}
      </div>
      {pages.map((p, i) => (
        <PageView key={i} page={p} masked={view === 'after'} onChange={() => bump((x) => x + 1)} />
      ))}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-tap flex-1 rounded-pill border border-line bg-paper text-sm text-ink">
            Cancel
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void save()} className="flex min-h-tap flex-1 items-center justify-center gap-2 rounded-pill bg-ink text-sm font-medium text-paper disabled:opacity-60">
          <EyeOff size={16} /> {busy ? 'Burning in the masks…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

function PageView({ page, masked, onChange }: { page: MaskPage; masked: boolean; onChange: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = page.width;
    c.height = page.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(masked ? maskedCanvas(page) : page.canvas, 0, 0);
    if (draft) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(draft.x, draft.y, draft.w, draft.h);
    }
  });

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.width, y: ((e.clientY - r.top) / r.height) * page.height };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  return (
    <div>
      <canvas
        ref={ref}
        className="w-full touch-none rounded-md border border-line bg-white"
        aria-label={masked ? 'Masked page. Drag to cover more.' : 'Original page'}
        onPointerDown={(e) => {
          if (!masked) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = at(e);
        }}
        onPointerMove={(e) => drag.current && setDraft(rect(drag.current, at(e)))}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const r = rect(drag.current, at(e));
          drag.current = null;
          setDraft(null);
          if (r.w > 6 && r.h > 6) {
            page.manual.push(r);
            onChange();
          }
        }}
      />
      {masked && page.manual.length > 0 && (
        <button
          type="button"
          className="mt-1 flex items-center gap-1 text-xs text-ink underline underline-offset-4"
          onClick={() => {
            page.manual.pop();
            onChange();
          }}
        >
          <Undo2 size={12} /> Remove last box
        </button>
      )}
    </div>
  );
}
