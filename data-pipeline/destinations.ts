import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DESTINATIONS } from './destination-list';
import { RAW_DIR, politeFetch, sleep, writeSeed } from './lib';

// Pipeline 2: destination descriptions and photos from Wikipedia + Wikimedia Commons.
// Text: Wikipedia lead summary (CC BY-SA 4.0). Photos: only freely licensed Commons files,
// stored with author and licence for attribution. No key needed.
// Every response is cached in .data/raw/wiki, so re-runs are fast and polite.

interface Summary {
  extract?: string;
  originalimage?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}
interface MediaList {
  items?: { title: string; type: string }[];
}

const CACHE = path.join(RAW_DIR, 'wiki');
const UNSUITABLE = /flag|map|locator|logo|coat_of_arms|emblem|seal|\.svg|montage|collage|skyline_montage|diagram/i;
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function cachedJson<T>(key: string, url: string): Promise<T> {
  const file = path.join(CACHE, `${key.replace(/[^\w.-]+/g, '_')}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    const data = (await (await politeFetch(url)).json()) as T;
    await fs.mkdir(CACHE, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
    await sleep(1200); // only pause after a real network call
    return data;
  }
}

/** "File_name.jpg" from any upload.wikimedia.org URL (originals and /thumb/ renditions). */
function commonsFileName(url: string): string | null {
  const clean = url.split('?')[0];
  if (!clean.includes('/wikipedia/commons/')) return null; // en.wikipedia-only files may be non-free
  const parts = clean.split('/');
  const thumb = parts.indexOf('thumb');
  return decodeURIComponent(thumb >= 0 ? parts[thumb + 3] : parts[parts.length - 1]);
}

/** Thumbnail URL for an original Commons file (…/commons/a/ab/F.jpg → …/commons/thumb/a/ab/F.jpg/500px-F.jpg). */
function thumbOf(original: string, width: number) {
  const m = original.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/(\w\/\w\w)\/([^/]+)$/);
  return m ? `${m[1]}/thumb/${m[2]}/${m[3]}/${width}px-${m[3]}` : original;
}

async function pickFile(title: string, summary: Summary): Promise<string | null> {
  const lead = summary.originalimage ? commonsFileName(summary.originalimage.source) : null;
  if (lead && !UNSUITABLE.test(lead)) return lead;
  // Lead image is a flag or map: take the first real photo on the page.
  const media = await cachedJson<MediaList>(`media-${title}`, `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`);
  const photo = media.items?.find((i) => i.type === 'image' && /\.(jpe?g|png)$/i.test(i.title) && !UNSUITABLE.test(i.title));
  return photo ? photo.title.replace(/^File:/, '') : null;
}

async function main() {
  // 1. Summaries and chosen photo per destination.
  const picked: { slug: string; summary: Summary; file: string | null }[] = [];
  for (const d of DESTINATIONS) {
    const title = d.wiki.replace(/ /g, '_');
    let summary: Summary = {};
    let file: string | null = null;
    try {
      summary = await cachedJson<Summary>(`summary-${title}`, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      const photoTitle = d.photoWiki?.replace(/ /g, '_');
      const photoSummary = photoTitle
        ? await cachedJson<Summary>(`summary-${photoTitle}`, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(photoTitle)}`)
        : summary;
      file = await pickFile(photoTitle ?? title, photoSummary);
    } catch (err) {
      console.warn(`${d.name}: ${String(err)}`);
    }
    picked.push({ slug: d.slug, summary, file });
  }

  // 2. Licence, author and a 1280px rendition for all photos, in batches of 40.
  const files = [...new Set(picked.map((p) => p.file).filter((f): f is string => !!f))];
  const info = new Map<string, { url: string; thumb: string; credit: string; license: string; page: string }>();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&titles=${encodeURIComponent(batch.map((f) => `File:${f}`).join('|'))}`;
    const data = await cachedJson<{
      query?: { normalized?: { from: string; to: string }[]; pages?: Record<string, { title: string; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> };
    }>(`commons-${createHash('sha1').update(batch.join('|')).digest('hex').slice(0, 16)}`, api);
    const back = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of Object.values(data.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const license = ii.extmetadata?.LicenseShortName?.value ?? '';
      if (!license || /fair use|non-free/i.test(license)) continue;
      const name = (back.get(page.title) ?? page.title).replace(/^File:/, '');
      // Plain upload host, no tracking query; Wikimedia only serves standard thumb widths (330/500/960/1280…).
      const big = (ii.thumburl ?? ii.url).split('?')[0].replace('//thumb.wikimedia.org/', '//upload.wikimedia.org/');
      info.set(name.replace(/ /g, '_'), {
        url: big,
        thumb: big.includes('/thumb/') ? big.replace(/\/\d+px-/, '/500px-') : thumbOf(big, 500),
        credit: `${stripHtml(ii.extmetadata?.Artist?.value ?? 'Unknown author')} · Wikimedia Commons`,
        license: stripHtml(license),
        page: ii.descriptionurl,
      });
    }
  }

  // 3. Seed file.
  const out = DESTINATIONS.map((d) => {
    const p = picked.find((x) => x.slug === d.slug)!;
    const img = p.file ? info.get(p.file.replace(/ /g, '_')) : undefined;
    console.log(`${d.name.padEnd(18)} ${p.summary.extract ? 'text ' : 'NO TEXT'} ${img ? `photo (${img.license})` : 'NO PHOTO'}`);
    return {
      ...d,
      description: p.summary.extract ?? null,
      source: 'wikipedia',
      sourceUrl: p.summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(d.wiki)}`,
      license: 'Text CC BY-SA 4.0 (Wikipedia); photo licence per file',
      imageUrl: img?.url ?? null,
      imageThumbUrl: img?.thumb ?? null,
      imageCredit: img?.credit ?? null,
      imageLicense: img ? `${img.license} · ${img.page}` : null,
    };
  });
  await writeSeed('destinations.json', out);
}

void main();
