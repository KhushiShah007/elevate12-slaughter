import { useNavigate } from 'react-router-dom';
import { ChevronRight, Languages, LogOut, RotateCcw, Sparkles, Type } from 'lucide-react';
import { useSettings, type Language } from '../../state/settings';
import { usePoints } from '../../hooks/usePoints';
import { sampleUser } from '../../hooks/useTrip';
import { PageHeader } from '../../components/layout/PageHeader';
import { StampCard } from '../../components/cards/StampCard';
import { Toggle } from '../../components/ui/Toggle';
import { Chip } from '../../components/ui/Chip';
import { num } from '../../utils/format';

const languages: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'mr', label: 'मराठी' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'bn', label: 'বাংলা' },
];

export default function Me() {
  const navigate = useNavigate();
  const s = useSettings();
  const points = usePoints();

  return (
    <div>
      <PageHeader title="Me" />
      <div className="space-y-6 px-gutter">
        <div className="flex items-center gap-4 rounded-lg border border-line bg-paper p-4 shadow-card">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-peach font-display text-2xl text-ink">{sampleUser.name[0]}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl text-ink">{sampleUser.name}</p>
            <p className="truncate text-sm text-muted">{sampleUser.phoneOrEmail}</p>
          </div>
          <Chip tone="warn" dot>
            Demo
          </Chip>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StampCard pastel="mint" tilt={-2}>
            <span className="text-3xl">☕</span>
            <p className="mt-1 font-display text-base leading-tight text-ink">Slow Explorer</p>
            <p className="text-[0.625rem] uppercase tracking-widest text-espresso">Persona</p>
          </StampCard>
          <StampCard pastel="butter" tilt={2}>
            <Sparkles size={26} className="text-ink" />
            <p className="mt-1 font-display text-2xl leading-tight text-ink">{num(points.total)}</p>
            <p className="text-[0.625rem] uppercase tracking-widest text-espresso">Points</p>
          </StampCard>
        </div>

        <section className="rounded-lg border border-line bg-paper p-4">
          <h2 className="flex items-center gap-2 text-lg">
            <Languages size={18} /> Language
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {languages.map((l) => (
              <button
                key={l.value}
                onClick={() => s.update({ language: l.value })}
                className={`min-h-tap rounded-pill border text-sm ${s.language === l.value ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Translations arrive with the language build. The app stays in English for now.</p>
        </section>

        <section className="divide-y divide-line rounded-lg border border-line bg-paper">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="flex items-center gap-3 text-ink">
              <Type size={18} />
              <span>
                <span className="block font-medium">Senior mode</span>
                <span className="block text-xs text-muted">Bigger text and buttons</span>
              </span>
            </span>
            <Toggle checked={s.seniorMode} onChange={(v) => s.update({ seniorMode: v })} label="Senior mode" />
          </div>
          <button onClick={() => navigate('/quiz')} className="flex min-h-[3.5rem] w-full items-center justify-between px-4 text-ink">
            <span className="flex items-center gap-3">
              <RotateCcw size={18} /> Retake persona quiz
            </span>
            <ChevronRight size={18} className="text-muted" />
          </button>
          <button
            onClick={() => {
              s.reset();
              navigate('/');
            }}
            className="flex min-h-[3.5rem] w-full items-center gap-3 px-4 text-bad"
          >
            <LogOut size={18} /> Sign out (demo)
          </button>
        </section>
      </div>
    </div>
  );
}
