import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardPaste, IndianRupee, MapPin, PlaneTakeoff, UsersRound } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { useOnline } from '../../hooks/useOnline';
import { useAuth } from '../../state/auth';
import { matchDestination, useDestinations } from '../../hooks/useDestinations';
import { useTripDraft, type DraftData, type SaveState } from '../../hooks/useTripDraft';
import { checkNewTrip, createTrip } from '../../db/repos/trips';
import { usePersona } from '../../hooks/usePersona';
import { defaultPersona } from '../../engines/persona';
import { budgetStyle, budgetStyleLabel, tripEstimate } from '../../engines/personalize';
import { inr } from '../../utils/format';
import { api, ApiError } from '../../api/client';
import { missingFor, tripFromBooking, type ParsedBooking } from '../../db/repos/importBooking';

/** Label/value rows for the details found in a pasted booking. */
function bookingFields(b: ParsedBooking): [string, string][] {
  const rows: [string, string | number | null][] = [
    ['Flight', b.flightNo],
    ['Route', b.from && b.to ? `${b.from} → ${b.to}` : null],
    ['Departs', b.departDate ? `${b.departDate}${b.departTime ? ` ${b.departTime}` : ''}` : null],
    ['Arrives', b.arriveTime ? `${b.arriveDate ?? ''} ${b.arriveTime}`.trim() : null],
    ['Hotel', b.hotelName],
    ['Check-in', b.checkIn],
    ['Check-out', b.checkOut],
    ['PNR / ref', b.pnr],
    ['Travellers', b.travellers],
    ['Total', b.totalInr != null ? inr(b.totalInr) : null],
  ];
  return rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);
}

const saveLabel: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving draft…',
  saved: 'Draft saved to your account',
  device: 'Draft saved on this phone. It will reach your account when you are online.',
  error: 'Draft saved on this phone only.',
};

export default function NewTrip() {
  const navigate = useNavigate();
  const online = useOnline();
  const { me } = useAuth();
  const { destinations } = useDestinations();
  const [mode, setMode] = useState<'plan' | 'paste'>('plan');
  const blank = useMemo<DraftData>(() => ({ title: '', from: me?.homeCity ?? '', to: '', startDate: '', endDate: '', travellers: 1, budgetInr: '' }), [me?.homeCity]);
  const draft = useTripDraft(blank);
  const d = draft.data;
  // Arrived from a destination page: fill in where to.
  const preset = (useLocation().state as { to?: string } | null)?.to;
  useEffect(() => {
    if (preset && !d.to) draft.update({ to: preset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState('');
  const [parsed, setParsed] = useState<{ source: 'ai' | 'rules'; booking: ParsedBooking } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const readBooking = async () => {
    setBusy(true);
    setPasteError(null);
    try {
      setParsed(await api<{ source: 'ai' | 'rules'; booking: ParsedBooking }>('POST', '/assistant/parse-booking', { text: pasted }, 40_000));
    } catch (err) {
      setPasteError(err instanceof ApiError ? err.message : 'Could not read the booking. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const fromBooking = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const trip = await tripFromBooking(parsed.booking, pasted);
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch {
      setPasteError('Could not create the trip. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const budget = d.budgetInr.trim() ? Number(d.budgetInr.replace(/[,\s₹]/g, '')) : null;
  const dest = matchDestination(destinations, d.to);
  const input = { title: d.title, from: d.from, to: d.to, destinationSlug: dest?.slug ?? null, startDate: d.startDate, endDate: d.endDate, travellers: d.travellers, budgetInr: budget };
  const errors = checkNewTrip(input, today);
  // Budget hint from the destination's typical costs and how this traveller likes to spend.
  const persona = usePersona()?.persona ?? defaultPersona();
  const days = d.startDate && d.endDate && d.endDate >= d.startDate ? Math.round((Date.parse(d.endDate) - Date.parse(d.startDate)) / 86_400_000) + 1 : 0;
  const style = budgetStyle(persona);
  const hint = dest?.dailyCostInr && days && d.travellers > 0 ? { days, label: budgetStyleLabel[style].toLowerCase(), total: tripEstimate(dest.dailyCostInr, style, days, d.travellers) } : null;
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  const create = async () => {
    if (Object.keys(errors).length) return setShowErrors(true);
    setBusy(true);
    try {
      const trip = await createTrip({ ...input, title: d.title || (dest ? `${dest.name} trip` : '') });
      await draft.discard();
      navigate(`/trips/${trip.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader back title="New trip" sub="Start from scratch, or paste a booking email or SMS." source={mode === 'paste' ? 'cloud' : 'device'} />
      <div className="space-y-5 px-gutter">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'plan', label: 'Plan it' },
            { value: 'paste', label: 'Paste booking' },
          ]}
        />

        {mode === 'plan' ? (
          <>
            {draft.resumed && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-butter px-4 py-2 text-sm text-ink">
                <span>Picked up your unfinished trip.</span>
                <button onClick={() => void draft.discard()} className="min-h-tap shrink-0 font-medium underline underline-offset-4">
                  Start over
                </button>
              </div>
            )}
            <Input label="Trip name" placeholder={dest ? `${dest.name} trip` : 'Kyoto & Tokyo'} value={d.title} onChange={(e) => draft.update({ title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" icon={<PlaneTakeoff size={18} />} placeholder="Mumbai" value={d.from} onChange={(e) => draft.update({ from: e.target.value })} />
              <Input
                label="To"
                icon={<MapPin size={18} />}
                placeholder="Tokyo"
                list="voyage-destinations"
                value={d.to}
                onChange={(e) => draft.update({ to: e.target.value })}
                error={err('to')}
              />
              <datalist id="voyage-destinations">
                {destinations.map((x) => (
                  <option key={x.slug} value={x.name}>
                    {x.country}
                  </option>
                ))}
              </datalist>
            </div>
            {dest && (
              <p className="-mt-2 text-xs text-muted">
                {dest.name}, {dest.country}
                {dest.bestTime && ` · best ${dest.bestTime}`}
                {dest.idealDays && ` · ${dest.idealDays} days is ideal`}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Leave" icon={<CalendarDays size={18} />} type="date" min={today} value={d.startDate} onChange={(e) => draft.update({ startDate: e.target.value })} error={err('startDate')} />
              <Input label="Return" icon={<CalendarDays size={18} />} type="date" min={d.startDate || today} value={d.endDate} onChange={(e) => draft.update({ endDate: e.target.value })} error={err('endDate')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Travellers"
                icon={<UsersRound size={18} />}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={String(d.travellers)}
                onChange={(e) => draft.update({ travellers: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                error={err('travellers')}
              />
              <Input
                label="Budget (optional)"
                icon={<IndianRupee size={18} />}
                inputMode="numeric"
                placeholder="60,000"
                value={d.budgetInr}
                onChange={(e) => draft.update({ budgetInr: e.target.value })}
                error={err('budgetInr')}
              />
            </div>
            {hint && (
              <p className="-mt-2 text-xs text-espresso">
                Typical for a {hint.label} trip: about {inr(hint.total)} for {d.travellers} {d.travellers === 1 ? 'person' : 'people'} × {hint.days} days, plus flights.{' '}
                {!d.budgetInr && (
                  <button onClick={() => draft.update({ budgetInr: String(hint.total) })} className="min-h-tap font-medium underline underline-offset-4">
                    Use this
                  </button>
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-espresso">
                <ClipboardPaste size={16} /> Booking email or SMS
              </span>
              <textarea
                rows={7}
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setParsed(null);
                }}
                placeholder="Paste your airline or hotel confirmation here…"
                className="w-full rounded-md border border-line bg-paper p-4 text-base text-ink outline-none placeholder:text-muted/70 focus:border-ink disabled:opacity-60"
              />
            </label>
            {parsed ? (
              <div className="rounded-md border border-line bg-paper p-4 text-sm">
                <p className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-display text-lg text-ink">{parsed.booking.kind === 'hotel' ? 'Hotel booking' : parsed.booking.kind === 'flight' ? 'Flight booking' : 'Not sure what this is'}</span>
                  <Chip>{parsed.source === 'ai' ? 'Read by AI' : 'Read on our server'}</Chip>
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {bookingFields(parsed.booking).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted">{k}</dt>
                      <dd className="text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted">Only details found in your text are used. Anything missing you can add later.</p>
                {missingFor(parsed.booking).length > 0 && <p className="mt-2 text-sm text-bad">Could not find: {missingFor(parsed.booking).join(', ')}.</p>}
              </div>
            ) : (
              <div className="rounded-md border border-line bg-sky/60 p-4 text-sm leading-relaxed text-espresso">
                We pick out the PNR, flight, airports, dates, times and amount. Your text is read on our server and not stored.
                {!online && (
                  <div className="mt-2">
                    <Chip tone="warn" dot>
                      You are offline
                    </Chip>
                  </div>
                )}
              </div>
            )}
            {pasteError && <p className="text-sm text-bad">{pasteError}</p>}
          </>
        )}

        <PillButton
          full
          disabled={busy || (mode === 'paste' && (!online || pasted.trim().length < 20 || (!!parsed && missingFor(parsed.booking).length > 0)))}
          onClick={() => void (mode === 'plan' ? create() : parsed ? fromBooking() : readBooking())}
        >
          {mode === 'plan' ? (busy ? 'Saving…' : 'Create trip') : busy ? 'Reading…' : parsed ? 'Create trip from this booking' : 'Read booking'}
        </PillButton>
        {mode === 'plan' && (
          <p className="text-center text-xs text-muted" role="status">
            {saveLabel[draft.save] || (online ? 'Your draft saves as you type.' : 'Offline: the trip saves on this phone and syncs later.')}
          </p>
        )}
      </div>
    </div>
  );
}
