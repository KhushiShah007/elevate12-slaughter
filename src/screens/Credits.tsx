import { PageHeader } from '../components/layout/PageHeader';
import { photoCredits } from '../data/photos';

// Who made the photos and data Voyage shows. Required by the CC BY-SA and ODbL licences.

const sources = [
  { name: 'Wikimedia Commons', what: 'Destination and landmark photos', license: 'Each photo’s own free licence (below)', url: 'https://commons.wikimedia.org' },
  { name: 'Wikipedia', what: 'Destination descriptions', license: 'CC BY-SA 4.0', url: 'https://en.wikipedia.org' },
  { name: 'OpenStreetMap contributors', what: 'Hotels, attractions and restaurants', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'OpenFlights', what: 'Airports, airlines and routes', license: 'ODbL 1.0', url: 'https://openflights.org/data.html' },
];

export default function Credits() {
  const photos = photoCredits();
  return (
    <div className="pb-12">
      <PageHeader back title="Credits" sub="The open data and photos inside Voyage, and the people who made them." />
      <div className="space-y-8 px-gutter">
        <section>
          <h2 className="mb-3 text-xl">Data</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-paper">
            {sources.map((s) => (
              <li key={s.name} className="px-4 py-3 text-sm">
                <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-4">
                  {s.name}
                </a>
                <span className="block text-espresso">{s.what}</span>
                <span className="block text-xs text-muted">{s.license}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl">Photos ({photos.length})</h2>
          <ul className="space-y-3">
            {photos.map((p) => (
              <li key={p.src} className="flex gap-3 rounded-md border border-line bg-paper p-2">
                <img src={p.src} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded object-cover" />
                <span className="min-w-0 text-xs leading-relaxed">
                  <span className="block font-medium capitalize text-ink">{p.title}</span>
                  <span className="block truncate text-espresso">{p.credit}</span>
                  {p.page ? (
                    <a href={p.page} target="_blank" rel="noreferrer" className="text-muted underline underline-offset-2">
                      {p.license}
                    </a>
                  ) : (
                    <span className="text-muted">{p.license}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
