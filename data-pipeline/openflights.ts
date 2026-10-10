import { cachedDownload, parseCsvLine, writeSeed } from './lib';

// Pipeline 1: airports, airlines and routes from OpenFlights (ODbL).
// https://openflights.org/data.html
// Note: OpenFlights routes are a 2014 snapshot. They are used only for autocomplete and
// for clearly labelled "indicative" schedules when no live flight provider is configured.

const BASE = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data';
export const OPENFLIGHTS = { source: 'openflights', sourceUrl: 'https://openflights.org/data.html', license: 'ODbL-1.0' };

const lines = (text: string) => text.split(/\r?\n/).filter(Boolean).map(parseCsvLine);

async function main() {
  const [airportsRaw, airlinesRaw, routesRaw] = await Promise.all([
    cachedDownload(`${BASE}/airports.dat`, 'openflights-airports.dat'),
    cachedDownload(`${BASE}/airlines.dat`, 'openflights-airlines.dat'),
    cachedDownload(`${BASE}/routes.dat`, 'openflights-routes.dat'),
  ]);

  // Airlines: active ones with an IATA code.
  const airlines = new Map<string, { iata: string; icao: string | null; name: string; country: string | null }>();
  for (const [, name, , iata, icao, , country, active] of lines(airlinesRaw)) {
    if (active === 'Y' && iata && /^[A-Z0-9]{2}$/.test(iata) && name && !airlines.has(iata)) {
      airlines.set(iata, { iata, icao, name, country });
    }
  }

  // Airports: anything with an IATA code; trimmed below to those with routes.
  const allAirports = new Map<string, { iata: string; icao: string | null; name: string; city: string; country: string; lat: number; lon: number; tz: string | null }>();
  for (const [, name, city, country, iata, icao, lat, lon, , , , tz, type] of lines(airportsRaw)) {
    if (!iata || !/^[A-Z]{3}$/.test(iata) || (type && type !== 'airport') || !name || !city || !country) continue;
    allAirports.set(iata, { iata, icao, name, city, country, lat: Number(lat), lon: Number(lon), tz });
  }

  // Routes: direct and one-stop routes between known airports on active airlines.
  const seen = new Set<string>();
  const routes: [string, string, string, number, string | null][] = [];
  const routeCount = new Map<string, number>();
  for (const [airline, , src, , dst, , , stops, equipment] of lines(routesRaw)) {
    if (!airline || !src || !dst || !airlines.has(airline) || !allAirports.has(src) || !allAirports.has(dst)) continue;
    const key = `${airline}-${src}-${dst}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push([airline, src, dst, Number(stops ?? 0), equipment]);
    routeCount.set(src, (routeCount.get(src) ?? 0) + 1);
    routeCount.set(dst, (routeCount.get(dst) ?? 0) + 1);
  }

  const airports = [...allAirports.values()]
    .filter((a) => routeCount.has(a.iata))
    .map((a) => ({ ...a, routeCount: routeCount.get(a.iata) ?? 0 }));
  const usedAirlines = new Set(routes.map((r) => r[0]));

  await writeSeed('airports.json', airports);
  await writeSeed('airlines.json', [...airlines.values()].filter((a) => usedAirlines.has(a.iata)));
  await writeSeed('routes.json', routes);
  console.log(`airports ${airports.length}, airlines ${usedAirlines.size}, routes ${routes.length}`);
}

void main();
