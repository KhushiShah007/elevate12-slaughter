import { getDb } from '../db/client';
import { seedAll } from './seed';

// npm run seed: (re)load all seed data. Stop `npm run dev` first when using local PGlite,
// because only one process can open the local database folder at a time.
const started = Date.now();
const { db, kind, close } = await getDb();
console.log(`Seeding ${kind} database…`);
await seedAll(db);
await close();
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
