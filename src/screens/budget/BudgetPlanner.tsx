import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, IndianRupee, PlaneTakeoff, Scissors, UsersRound } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { Segmented } from '../../components/ui/Segmented';
import { Chip } from '../../components/ui/Chip';
import { AirportField, airportForCity } from '../../components/flight/AirportField';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../state/auth';
import { usePersona } from '../../hooks/usePersona';
import { budgetStyle, budgetStyleLabel, type BudgetStyle } from '../../engines/personalize';
import { defaultPersona } from '../../engines/persona';
import { FIT_LABEL, type Fit } from '../../engines/budget';
import { destinationPhoto } from '../../data/photos';
import { inr } from '../../utils/format';
import { pastelBg, type Pastel } from '../../design/tokens';

interface Breakdown {
  travel: number;
  stay: number;
  food: number;
  local: number;
  activities: number;
  buffer: number;
  total: number;
}
interface Result {
  slug: string;
  name: string;
  country: string;
  isDomestic: boolean;
  bestTime: string | null;
  breakdown: Breakdown;
  fit: Fit;
  personaFit: number;
  valueScore: number;
}
interface Calendar {
  days: { date: string; pricePerPerson: number; total: number }[];
  chosen: { date: string; total: number };
  cheapest: { date: string; total: number };
  saving: number;
  shiftDays: number;
  note: string;
}
interface Cut {
  kind: string;
  title: string;
  saving: number;
  detail: string;
}

const PARTS: { key: keyof Omit<Breakdown, 'total'>; label: string; pastel: Pastel }[] = [
  { key: 'travel', label: 'Flights', pastel: 'sky' },
  { key: 'stay', label: 'Stay', pastel: 'peach' },
  { key: 'food', label: 'Food', pastel: 'rose' },
  { key: 'local', label: 'Local travel', pastel: 'butter' },
  { key: 'activities', label: 'Activities', pastel: 'mint' },
  { key: 'buffer', label: 'Buffer', pastel: 'lavender' },
];
const fitTone: Record<Fit, 'ok' | 'warn' | 'bad'> = { within: 'ok', tight: 'warn', over: 'bad' };

function BreakdownBar({ b }: { b: Breakdown }) {
  return (
    <>
      <div className="mt-2 flex h-3 overflow-hidden rounded-pill border border-line">
        {PARTS.map((p) => (
          <span key={p.key} className={pastelBg[p.pastel]} style={{ width: `${(b[p.key] / b.total) * 100}%` }} title={p.label} />
        ))}
      </div>
    </>
  );
}

export default function BudgetPlanner() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const persona = usePersona();
  const [budget, setBudget] = useState('40000');
  const [origin, setOrigin] = useState('');
  const [date, setDate] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [days, setDays] = useState(4);
  const [travellers, setTravellers] = useState(2);
  const [style, setStyle] = useState<BudgetStyle>(budgetStyle(persona?.persona ?? defaultPersona()));
  const [sort, setSort] = useState<'cheap' | 'value' | 'you'>('you');
  const [where, setWhere] = useState<'all' | 'india' | 'abroad'>('all');
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Result | null>(null);

  useEffect(() => {
    void airportForCity(me?.homeCity || 'Mumbai').then((a) => a && setOrigin((o) => o || a.iata));
  }, [me?.homeCity]);
  useEffect(() => {
    if (persona?.fromQuiz) setStyle(budgetStyle(persona.persona));
  }, [persona?.fromQuiz, persona?.persona]);

  const amount = Number(budget.replace(/[,\s₹]/g, '')) || 0;
  const search = async () => {
    setBusy(true);
    setError(null);
    setOpen(null);
    try {
      const r = await api<{ results: Result[] }>('GET', `/budget/where?budget=${amount}&origin=${origin}&days=${days}&travellers=${travellers}&style=${style}&date=${date}`);
      setResults(r.results);
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Could not search. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const list = useMemo(() => {
    const rows = (results ?? []).filter((r) => (where === 'all' ? true : where === 'india' ? r.isDomestic : !r.isDomestic));
    const fitRank = (f: Fit) => (f === 'within' ? 0 : f === 'tight' ? 1 : 2);
    if (sort === 'cheap') return [...rows].sort((a, b) => a.breakdown.total - b.breakdown.total);
    if (sort === 'value') return [...rows].sort((a, b) => fitRank(a.fit) - fitRank(b.fit) || b.valueScore - a.valueScore);
    return [...rows].sort((a, b) => fitRank(a.fit) - fitRank(b.fit) || b.personaFit - a.personaFit || a.breakdown.total - b.breakdown.total);
  }, [results, sort, where]);
  const counts = { within: list.filter((r) => r.fit === 'within').length };

  return (
    <div className="pb-10">
      <PageHeader back title="Where can I go?" sub="Tell us your budget. We price every destination end to end." source="cloud" />
      <div className="space-y-4 px-gutter">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Total budget" icon={<IndianRupee size={18} />} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <AirportField label="From" icon={<PlaneTakeoff size={18} />} value={origin} onChange={setOrigin} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Leave" icon={<CalendarDays size={18} />} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Days" type="number" min={1} max={30} value={String(days)} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          <Input label="People" icon={<UsersRound size={16} />} type="number" min={1} max={20} value={String(travellers)} onChange={(e) => setTravellers(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </div>
        <Segmented
          value={style}
          onChange={setStyle}
          options={(['shoestring', 'moderate', 'comfort', 'luxury'] as const).map((s) => ({ value: s, label: budgetStyleLabel[s] }))}
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <PillButton full disabled={busy || amount < 1000 || !origin} onClick={() => void search()}>
          {busy ? 'Pricing 53 destinations…' : `Find trips for ${inr(amount)}`}
        </PillButton>

        {results && (
          <>
            <p className="text-sm text-ink">
              <span className="font-semibold">{counts.within}</span> places fit {inr(amount)} for {travellers} {travellers === 1 ? 'person' : 'people'}, {days} days.{' '}
              <Chip>Estimates</Chip>
            </p>
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'you', label: 'Best for you' },
                { value: 'cheap', label: 'Cheapest' },
                { value: 'value', label: 'Best value' },
              ]}
            />
            <Segmented
              value={where}
              onChange={setWhere}
              options={[
                { value: 'all', label: 'All' },
                { value: 'india', label: 'India' },
                { value: 'abroad', label: 'Abroad' },
              ]}
            />
            <ul className="space-y-3">
              {list.map((r) => {
                const photo = destinationPhoto(r.slug);
                const isOpen = open?.slug === r.slug;
                return (
                  <li key={r.slug} className="overflow-hidden rounded-lg border border-line bg-paper shadow-card">
                    <button onClick={() => setOpen(isOpen ? null : r)} className="flex w-full items-center gap-3 p-3 text-left">
                      {photo && <img src={photo.src} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md object-cover" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-display text-lg text-ink">{r.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-ink">{inr(r.breakdown.total)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                          <span className="truncate">
                            {r.country}
                            {r.personaFit > 0 && ' · suits you'}
                          </span>
                          <Chip tone={fitTone[r.fit]} dot>
                            {FIT_LABEL[r.fit]}
                          </Chip>
                        </span>
                        <BreakdownBar b={r.breakdown} />
                      </span>
                    </button>
                    {isOpen && <Details r={r} budget={amount} origin={origin} date={date} days={days} travellers={travellers} style={style} onPlan={(to) => navigate('/trips/new', { state: to })} />}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">Totals include return flights (distance-based estimate), stay, food, local travel, activities and a 5% buffer.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Details({ r, budget, origin, date, days, travellers, style, onPlan }: {
  r: Result;
  budget: number;
  origin: string;
  date: string;
  days: number;
  travellers: number;
  style: BudgetStyle;
  onPlan: (preset: { to: string; startDate: string; endDate: string; travellers: number; budgetInr: number }) => void;
}) {
  const [cal, setCal] = useState<Calendar | null>(null);
  const [cuts, setCuts] = useState<Cut[] | null>(null);

  useEffect(() => {
    api<{ destination: { airportIata: string | null } }>('GET', `/destinations/${r.slug}`)
      .then((d) => {
        const iata = d.destination.airportIata;
        if (iata && iata !== origin) return api<Calendar>('GET', `/budget/dates?origin=${origin}&dest=${iata}&date=${date}&travellers=${travellers}`).then(setCal);
      })
      .catch(() => setCal(null));
    if (r.fit !== 'within') {
      api<{ cuts: Cut[] }>('GET', `/budget/cuts?slug=${r.slug}&budget=${budget}&origin=${origin}&days=${days}&travellers=${travellers}&style=${style}&date=${date}`)
        .then((c) => setCuts(c.cuts))
        .catch(() => setCuts(null));
    }
  }, [r.slug, r.fit, origin, date, travellers, budget, days, style]);

  const max = cal ? Math.max(...cal.days.map((d) => d.total)) : 0;
  const min = cal ? Math.min(...cal.days.map((d) => d.total)) : 0;
  const endDate = new Date(Date.parse(`${date}T00:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
      <ul className="space-y-1 text-sm">
        {PARTS.map((p) => (
          <li key={p.key} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-espresso">
              <span className={`h-3 w-3 rounded-full border border-ink/10 ${pastelBg[p.pastel]}`} />
              {p.label}
            </span>
            <span className="tabular-nums text-ink">{inr(r.breakdown[p.key])}</span>
          </li>
        ))}
        <li className="flex items-center justify-between border-t border-line pt-1 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{inr(r.breakdown.total)}</span>
        </li>
      </ul>

      {cal && (
        <div>
          <p className="mb-1 text-sm font-medium text-ink">Cheapest dates to fly (per {travellers === 1 ? 'person' : `${travellers} people`}, one way)</p>
          <div className="no-scrollbar flex gap-1 overflow-x-auto pb-1">
            {cal.days.map((d) => {
              const heat = max === min ? 0 : (d.total - min) / (max - min);
              const tone = heat < 0.33 ? 'bg-mint' : heat < 0.66 ? 'bg-butter' : 'bg-rose';
              return (
                <span key={d.date} className={`flex w-12 shrink-0 flex-col items-center rounded-sm border px-1 py-1 text-[0.625rem] ${tone} ${d.date === cal.chosen.date ? 'border-ink' : 'border-line'}`}>
                  <span className="text-espresso">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  <span className="font-semibold tabular-nums text-ink">{Math.round(d.total / 100) / 10}k</span>
                </span>
              );
            })}
          </div>
          {cal.saving > 0 && (
            <p className="mt-1 text-sm text-ok">
              Shift {Math.abs(cal.shiftDays)} day{Math.abs(cal.shiftDays) === 1 ? '' : 's'} {cal.shiftDays > 0 ? 'later' : 'earlier'} and save about {inr(cal.saving)} each way.
            </p>
          )}
          <p className="text-[0.6875rem] text-muted">{cal.note}</p>
        </div>
      )}

      {cuts && cuts.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink">
            <Scissors size={14} /> Over budget? Ways to save
          </p>
          <ul className="space-y-1">
            {cuts.map((c) => (
              <li key={c.kind} className="flex items-start justify-between gap-3 rounded-md bg-ivory px-3 py-2 text-sm">
                <span>
                  {c.title}
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ok">−{inr(c.saving)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PillButton full onClick={() => onPlan({ to: r.name, startDate: date, endDate, travellers, budgetInr: budget })}>
        Plan this trip
      </PillButton>
    </div>
  );
}
