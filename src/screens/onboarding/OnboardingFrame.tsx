import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Chip } from '../../components/ui/Chip';

/** Shared layout for sign-in steps: back, a step count, the "Demo sign-in" label. */
export function OnboardingFrame({ step, title, sub, children, footer }: {
  step?: string;
  title: string;
  sub?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col px-gutter pb-8 pt-3">
      <div className="flex min-h-tap items-center justify-between">
        <button onClick={() => navigate(-1)} className="-ml-3 flex min-h-tap items-center pl-1.5 pr-3 text-sm font-medium text-espresso" aria-label="Back">
          <ChevronLeft size={20} /> Back
        </button>
        <Chip tone="warn" dot>
          Demo sign-in
        </Chip>
      </div>
      {step && <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted">{step}</p>}
      <h1 className={`text-[2.25rem] leading-[1.1] ${step ? 'mt-2' : 'mt-6'}`}>{title}</h1>
      {sub && <p className="mt-2 text-sm leading-relaxed text-espresso">{sub}</p>}
      <div className="mt-8 flex-1">{children}</div>
      <div className="pt-6">{footer}</div>
    </div>
  );
}
