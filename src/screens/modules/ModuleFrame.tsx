import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { modulePastel, pastelBg } from '../../design/tokens';
import { PageHeader } from '../../components/layout/PageHeader';
import { SampleTag } from '../../components/ui/Chip';
import { useTrip } from '../../hooks/useTrip';
import type { ModuleKey } from '../trips/TripWorkspace';
import { useT } from '../../i18n';
import NotFound from '../NotFound';

type TripData = NonNullable<ReturnType<typeof useTrip>>;

/** Shared module layout: pastel wash in the module's colour, header, sample-data label. */
export function ModuleFrame({ module, title, sub, source = 'device', children }: {
  module: ModuleKey;
  title: string;
  sub?: ReactNode;
  source?: 'device' | 'cloud';
  children: (data: TripData) => ReactNode;
}) {
  const { tripId } = useParams();
  const data = useTrip(tripId);
  const { t, lang } = useT();
  if (data === undefined) return null;
  if (!data) return <NotFound />;

  return (
    <div className="relative">
      <div className={`absolute inset-x-0 top-0 -z-0 h-44 rounded-b-xl opacity-60 ${pastelBg[modulePastel[module]]}`} />
      <div className="relative">
        <PageHeader back={`/trips/${data.trip.id}`} title={lang === 'en' ? title : t(`module.${module}`)} sub={lang === 'en' ? (sub ?? data.trip.title) : data.trip.title} source={source} right={<SampleTag />} />
        <div className="px-gutter">{children(data)}</div>
      </div>
    </div>
  );
}
