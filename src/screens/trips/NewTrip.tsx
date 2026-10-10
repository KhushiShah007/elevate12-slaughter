import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardPaste, MapPin, PlaneTakeoff } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Segmented } from '../../components/ui/Segmented';
import { Input } from '../../components/ui/Input';
import { PillButton } from '../../components/ui/PillButton';
import { Chip } from '../../components/ui/Chip';
import { useOnline } from '../../hooks/useOnline';

export default function NewTrip() {
  const navigate = useNavigate();
  const online = useOnline();
  const [mode, setMode] = useState<'plan' | 'paste'>('plan');

  // Prototype: both paths open the sample trip workspace.
  const create = () => navigate('/trips/t-japan');

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
            <Input label="Trip name" placeholder="Kyoto & Tokyo" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="From" icon={<PlaneTakeoff size={18} />} placeholder="Mumbai" />
              <Input label="To" icon={<MapPin size={18} />} placeholder="Tokyo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Leave" icon={<CalendarDays size={18} />} type="date" />
              <Input label="Return" icon={<CalendarDays size={18} />} type="date" />
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-espresso">
                <ClipboardPaste size={16} /> Booking email or SMS
              </span>
              <textarea
                rows={7}
                placeholder="Paste your airline or hotel confirmation here…"
                className="w-full rounded-md border border-line bg-paper p-4 text-base text-ink outline-none placeholder:text-muted/70 focus:border-ink"
              />
            </label>
            <div className="rounded-md border border-line bg-sky/60 p-4 text-sm leading-relaxed text-espresso">
              Reading the booking needs internet (it uses Gemini through our server). Offline, we will load a sample trip instead.
              {!online && (
                <div className="mt-2">
                  <Chip tone="warn" dot>
                    You are offline
                  </Chip>
                </div>
              )}
            </div>
          </>
        )}

        <PillButton full onClick={create}>
          {mode === 'plan' ? 'Create trip' : 'Read booking'}
        </PillButton>
      </div>
    </div>
  );
}
