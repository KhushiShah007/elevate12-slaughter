import { Clock } from 'lucide-react';
import { ModuleFrame } from './ModuleFrame';
import { BoardingPassCard } from '../../components/flight/BoardingPassCard';
import { FlightFinder } from '../../components/flight/FlightFinder';
import { connectionRisk, minutesBetween } from '../../engines/connectionRisk';
import { duration } from '../../utils/format';

export default function Flights() {
  return (
    <ModuleFrame module="flights" title="Flights">
      {({ trip, flights, bookings }) => (
        <div className="space-y-8 pb-8">
          {flights.length > 0 && (
            <div className="space-y-3">
              {flights.map((f, i) => {
                const next = flights[i + 1];
                const layover = next ? minutesBetween(f.arrive, next.depart) : null;
                return (
                  <div key={f.id}>
                    <BoardingPassCard flight={f} risk={layover !== null ? connectionRisk(layover) : undefined} pastel={i % 2 ? undefined : 'sky'} />
                    {layover !== null && (
                      <div className="my-3 flex items-center gap-2 px-2 text-sm text-espresso">
                        <Clock size={16} />
                        {duration(layover)} layover in {f.toCity} · Terminal {next!.terminal}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="pt-2 text-xs text-muted">PNR {flights[0]?.pnr}. Times are local to each airport.</p>
            </div>
          )}
          <FlightFinder trip={trip} saved={bookings} />
        </div>
      )}
    </ModuleFrame>
  );
}
