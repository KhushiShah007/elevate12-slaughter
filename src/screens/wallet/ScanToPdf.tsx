import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, FileText, Plus } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';

export default function ScanToPdf() {
  const navigate = useNavigate();
  const [pages, setPages] = useState(0);

  return (
    <div>
      <PageHeader back title="Scan to PDF" sub="Line up the page inside the frame." right={<Chip>Prototype</Chip>} />
      <div className="px-gutter">
        {/* Viewfinder mock. Goal 6 connects the camera. */}
        <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-lg bg-espresso">
          <div className="relative h-[78%] w-[78%]">
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-md', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-md', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-md', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-md'].map((c) => (
              <span key={c} className={`absolute h-10 w-10 border-ivory ${c}`} />
            ))}
            <div className="grid h-full place-items-center text-center text-sm text-ivory/70">
              <span>
                <FileText size={40} strokeWidth={1.25} className="mx-auto mb-2" />
                Camera preview
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-2">
            {Array.from({ length: pages }, (_, i) => (
              <span key={i} className="grid h-14 w-11 place-items-center rounded-sm border border-line bg-paper text-xs font-semibold text-espresso shadow-card">
                {i + 1}
              </span>
            ))}
            {!pages && <span className="text-sm text-muted">No pages yet</span>}
          </div>
          <button
            onClick={() => setPages((p) => Math.min(p + 1, 5))}
            aria-label="Capture page"
            className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full border-4 border-sand bg-ink text-ivory shadow-lift"
          >
            {pages ? <Plus size={26} /> : <Camera size={26} />}
          </button>
        </div>

        <PillButton full className="mt-6" disabled={!pages} onClick={() => navigate('/wallet')}>
          Save {pages || ''} {pages === 1 ? 'page' : 'pages'} as PDF
        </PillButton>
      </div>
    </div>
  );
}
