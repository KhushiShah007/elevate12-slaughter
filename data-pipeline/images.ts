import fs from 'node:fs/promises';
import path from 'node:path';
import { politeFetch, sleep } from './lib';

// Pipeline 4: self-host the photos the app shows, so they load fast, work offline and
// never depend on hot-linking. Sources are freely licensed Wikimedia Commons files;
// author and licence are written to src/data/photos.json and shown in the app.
//
//  - one 500px photo per destination (from server/seed/data/destinations.json)
//  - a few landmark photos for the sample trip memories
//
// Re-runs skip files that already exist. Run: npm run pipeline:images

const OUT = path.resolve(process.cwd(), 'public/img');
const MANIFEST = path.resolve(process.cwd(), 'src/data/photos.json');
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export interface Photo {
  src: string; // path under /public
  credit: string; // "Author · Wikimedia Commons"
  license: string; // "CC BY-SA 4.0"
  page: string; // Commons file page
}

/** Sample-trip memories: caption key → Wikipedia article whose lead photo fits. */
const MEMORIES: Record<string, string> = {
  'amer-fort': 'Amber Fort',
  kachori: 'Kachori',
  'hawa-mahal': 'Hawa Mahal',
  'marina-bay': 'Marina Bay, Singapore',
  'gardens-by-the-bay': 'Gardens by the Bay',
  'fishing-nets': 'Chinese fishing nets',
  backwaters: 'Kerala backwaters',
};

async function download(url: string, file: string) {
  try {
    await fs.access(file);
    return false; // already have it
  } catch {
    /* fetch it */
  }
  const res = await politeFetch(url, { headers: { accept: 'image/*' } });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  await sleep(1500);
  return true;
}

/** Lead photo of a Wikipedia article, with its Commons licence, at a standard width. */
async function wikiPhoto(article: string) {
  const summary = (await (await politeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article.replace(/ /g, '_'))}`)).json()) as {
    originalimage?: { source: string };
  };
  const src = summary.originalimage?.source;
  if (!src?.includes('/wikipedia/commons/')) return null; // only Commons files are freely licensed
  const parts = src.split('?')[0].split('/');
  const thumb = parts.indexOf('thumb');
  const fileName = decodeURIComponent(thumb >= 0 ? parts[thumb + 3] : parts[parts.length - 1]);
  await sleep(1200);
  const info = (await (
    await politeFetch(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&titles=${encodeURIComponent(`File:${fileName}`)}`,
    )
  ).json()) as { query?: { pages?: Record<string, { imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } };
  const ii = Object.values(info.query?.pages ?? {})[0]?.imageinfo?.[0];
  const license = ii?.extmetadata?.LicenseShortName?.value;
  if (!ii || !license || /fair use|non-free/i.test(license)) return null;
  await sleep(1200);
  return {
    url: (ii.thumburl ?? ii.url).split('?')[0],
    credit: `${stripHtml(ii.extmetadata?.Artist?.value ?? 'Unknown author')} · Wikimedia Commons`,
    license: stripHtml(license),
    page: ii.descriptionurl,
  };
}

async function main() {
  const manifest: { destinations: Record<string, Photo & { name: string; country: string; featured: boolean }>; memories: Record<string, Photo> } = {
    destinations: {},
    memories: {},
  };

  const dests = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'server/seed/data/destinations.json'), 'utf8')) as {
    slug: string;
    name: string;
    country: string;
    featured: boolean;
    imageThumbUrl: string | null;
    imageCredit: string | null;
    imageLicense: string | null;
  }[];
  let fetched = 0;
  for (const d of dests) {
    if (!d.imageThumbUrl) continue;
    const ext = path.extname(d.imageThumbUrl.split('?')[0]).toLowerCase() === '.png' ? '.png' : '.jpg';
    const rel = `/img/dest/${d.slug}${ext}`;
    try {
      if (await download(d.imageThumbUrl, path.join(OUT, 'dest', `${d.slug}${ext}`))) fetched++;
    } catch (err) {
      console.warn(`${d.slug}: ${String(err)}`);
      continue;
    }
    const [license, page] = (d.imageLicense ?? '').split(' · ');
    manifest.destinations[d.slug] = { src: rel, credit: d.imageCredit ?? 'Wikimedia Commons', license, page: page ?? '', name: d.name, country: d.country, featured: Boolean(d.featured) };
    process.stdout.write('.');
  }
  console.log(`\ndestinations: ${Object.keys(manifest.destinations).length} photos (${fetched} downloaded now)`);

  for (const [key, article] of Object.entries(MEMORIES)) {
    try {
      const p = await wikiPhoto(article);
      if (!p) {
        console.warn(`${key}: no free photo on "${article}"`);
        continue;
      }
      const ext = p.url.toLowerCase().endsWith('.png') ? '.png' : '.jpg';
      await download(p.url, path.join(OUT, 'memories', `${key}${ext}`));
      manifest.memories[key] = { src: `/img/memories/${key}${ext}`, credit: p.credit, license: p.license, page: p.page };
      console.log(`memory ${key}: ${p.license}`);
    } catch (err) {
      console.warn(`${key}: ${String(err)}`);
    }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), MANIFEST)}`);
}

await main();
