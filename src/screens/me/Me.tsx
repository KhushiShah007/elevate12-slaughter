import { useNavigate } from 'react-router-dom';
import { ChevronRight, Languages, LogOut, RotateCcw, Sparkles, Type } from 'lucide-react';
import { useSettings } from '../../state/settings';
import { LANGUAGES, useT } from '../../i18n';
import { usePoints } from '../../hooks/usePoints';
import { useTraveller } from '../../hooks/useTrip';
import { PageHeader } from '../../components/layout/PageHeader';
import { StampCard } from '../../components/cards/StampCard';
import { Toggle } from '../../components/ui/Toggle';
import { Chip } from '../../components/ui/Chip';
import { StorageNote, SyncStatus } from '../../components/layout/SyncStatus';
import { PersonaEffects, PersonaStamp } from '../../components/persona/PersonaCard';
import { usePersona } from '../../hooks/usePersona';
import { num } from '../../utils/format';

export default function Me() {
  const navigate = useNavigate();
  const s = useSettings();
  const { t } = useT();
  const points = usePoints();
  const traveller = useTraveller();
  const persona = usePersona();
  if (!traveller || !points || !persona) return null;

  return (
    <div>
      <PageHeader title={t('me.title')} />
      <div className="space-y-6 px-gutter">
        <div className="flex items-center gap-4 rounded-lg border border-line bg-paper p-4 shadow-card">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-peach font-display text-2xl text-ink">{traveller.name[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl text-ink">{traveller.name}</p>
            <p className="truncate text-sm text-muted">{traveller.contact}</p>
          </div>
          <Chip tone="warn" dot>
            Demo
          </Chip>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <PersonaStamp persona={persona.persona} size="sm" className="" />
          <StampCard pastel="butter" tilt={2}>
            <Sparkles size={26} className="text-ink" />
            <p className="mt-1 font-display text-2xl leading-tight text-ink">{num(points.total)}</p>
            <p className="text-[0.625rem] uppercase tracking-widest text-espresso">{t('me.points')}</p>
          </StampCard>
        </div>

        <section className="rounded-lg border border-line bg-paper p-4">
          <h2 className="mb-3 text-lg">{t('quiz.whatChanges')}</h2>
          <PersonaEffects persona={persona.persona} />
        </section>

        <section>
          <h2 className="mb-2 text-lg">{t('me.sync')}</h2>
          <SyncStatus />
          <StorageNote />
        </section>

        <section className="rounded-lg border border-line bg-paper p-4">
          <h2 className="flex items-center gap-2 text-lg">
            <Languages size={18} /> {t('me.language')}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => s.update({ language: l.code })}
                lang={l.htmlLang}
                className={`min-h-tap rounded-pill border text-sm ${s.language === l.code ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'}`}
              >
                {l.native}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('me.languageNote')}</p>
        </section>

        <section className="divide-y divide-line rounded-lg border border-line bg-paper">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="flex items-center gap-3 text-ink">
              <Type size={18} />
              <span>
                <span className="block font-medium">{t('me.senior')}</span>
                <span className="block text-xs text-muted">{t('me.seniorSub')}</span>
              </span>
            </span>
            <Toggle checked={s.seniorMode} onChange={(v) => s.update({ seniorMode: v })} label={t('me.senior')} />
          </div>
          <button onClick={() => navigate('/quiz')} className="flex min-h-[3.5rem] w-full items-center justify-between px-4 text-ink">
            <span className="flex items-center gap-3">
              <RotateCcw size={18} /> {t('me.retakeQuiz')}
            </span>
            <ChevronRight size={18} className="text-muted" />
          </button>
          <button
            onClick={() => {
              s.reset();
              navigate('/welcome', { replace: true });
            }}
            className="flex min-h-[3.5rem] w-full items-center gap-3 px-4 text-bad"
          >
            <LogOut size={18} /> {t('me.signOut')}
          </button>
        </section>
      </div>
    </div>
  );
}
