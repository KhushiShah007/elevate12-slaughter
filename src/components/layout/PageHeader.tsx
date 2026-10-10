import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { SourceChip } from './SourceChip';

/** Screen title row: optional back button, title, and the ON-DEVICE / CLOUD chip. */
export function PageHeader({ title, sub, back, source = 'device', right }: {
  title: string;
  sub?: ReactNode;
  back?: boolean | string;
  source?: 'device' | 'cloud';
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="px-gutter pb-4 pt-2">
      <div className="mb-1 flex min-h-tap items-center justify-between gap-2">
        {back ? (
          <button
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="-ml-3 flex min-h-tap items-center gap-0.5 rounded-pill pl-1.5 pr-3 text-sm font-medium text-espresso hover:bg-sand/60"
          >
            <ChevronLeft size={20} /> Back
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {right}
          <SourceChip source={source} />
        </div>
      </div>
      <h1 className="text-[2rem] leading-[1.1]">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}
