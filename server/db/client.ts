import fs from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

// One database handle for the whole server.
// - DATABASE_URL set (Supabase / Neon / any Postgres): connect with postgres-js.
// - Not set (local dev): PGlite, a real Postgres running inside Node, stored in .data/pglite.
// Migrations in server/db/migrations run automatically on first use.

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// From the project root, so it works in the dev server, scripts and on Vercel (see vercel.json includeFiles).
const MIGRATIONS = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'server/db/migrations');

type Conn = { db: Db; kind: 'postgres' | 'pglite'; close: () => Promise<void>; migrate: () => Promise<void> };
// Kept on globalThis so dev-server reloads reuse the one open database.
const g = globalThis as unknown as { __voyageDb?: Promise<Conn> | null };

/**
 * Tidy a pasted connection string: trim spaces and quotes, drop a "DATABASE_URL=" prefix,
 * and percent-encode the password (Supabase passwords often contain @ # / ?).
 */
export function normalizeDbUrl(raw: string | undefined): string | undefined {
  let u = raw?.trim().replace(/^DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();
  if (!u) return undefined;
  const m = u.match(/^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([^@]+)$/);
  if (m) {
    const [, scheme, user, pass, rest] = m;
    let plain = pass;
    try {
      plain = decodeURIComponent(pass);
    } catch {
      /* not encoded */
    }
    u = `${scheme}${user}:${encodeURIComponent(plain)}@${rest}`;
  }
  if (/\[YOUR-PASSWORD\]/i.test(raw ?? '') || /%5BYOUR-PASSWORD%5D/i.test(u)) throw new Error('DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Put your real database password there.');
  if (!/^postgres(?:ql)?:\/\//i.test(u)) {
    const scheme = u.match(/^([a-z]+):\/\//i)?.[1];
    throw new Error(
      scheme
        ? `DATABASE_URL starts with "${scheme}://" but must start with "postgresql://". Use the database connection string (Supabase: Connect -> Transaction pooler), not the project URL.`
        : 'DATABASE_URL must start with "postgresql://". Use the database connection string (Supabase: Connect -> Transaction pooler).',
    );
  }
  try {
    new URL(u);
  } catch {
    // Describe the shape only; never echo the value (it holds the password).
    const problems = [
      /\s/.test(u) && 'it contains a space or line break',
      !u.includes('@') && 'there is no "@" between the password and the host',
      !/:\d+\//.test(u) && 'the ":6543/" port part is missing',
    ].filter(Boolean);
    throw new Error(`DATABASE_URL is not a valid connection string${problems.length ? `: ${problems.join('; ')}` : ''}. Expected postgresql://USER:PASSWORD@HOST:6543/postgres`);
  }
  return u;
}

async function connect() {
  const url = normalizeDbUrl(process.env.DATABASE_URL);
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const sql = postgres(url, { max: 5, prepare: false }); // prepare:false works with poolers (Supabase/Neon)
    const db = drizzle(sql, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as Db, kind: 'postgres' as const, close: () => sql.end(), migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }) };
  }

  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. Add your Supabase or Neon connection string in Vercel settings.');
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGLITE_DIR ?? path.resolve(process.cwd(), '.data/pglite');
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, kind: 'pglite' as const, close: () => client.close(), migrate: () => migrate(db, { migrationsFolder: MIGRATIONS }) };
}

const migrationCount = () => {
  try {
    return fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).length;
  } catch {
    return 0;
  }
};
const m = globalThis as unknown as { __voyageMigrations?: number };

/** The database, connected and migrated. Safe to call from every request. */
export function getDb(): Promise<Conn> {
  // A handle opened by an older copy of this module (dev reload) has no count yet: check once.
  if (g.__voyageDb && m.__voyageMigrations == null) m.__voyageMigrations = 0;
  g.__voyageDb ??= connect()
    .then((c) => {
      m.__voyageMigrations = migrationCount();
      return c;
    })
    .catch((err) => {
      g.__voyageDb = null; // allow a retry on the next request
      throw err;
    });
  // Dev server: a migration added while it runs is applied on the next request (additive only).
  if (!process.env.VERCEL && m.__voyageMigrations != null && migrationCount() > m.__voyageMigrations) {
    m.__voyageMigrations = migrationCount();
    const before = g.__voyageDb;
    g.__voyageDb = before.then(async (c) => {
      try {
        if (typeof c.migrate === 'function') await c.migrate();
        else {
          // Opened by an older copy of this module: run the migrator directly.
          const { migrate } = c.kind === 'pglite' ? await import('drizzle-orm/pglite/migrator') : await import('drizzle-orm/postgres-js/migrator');
          await migrate(c.db as never, { migrationsFolder: MIGRATIONS });
        }
      } catch (err) {
        console.error('[db] could not apply new migrations', err);
      }
      return c;
    });
  }
  return g.__voyageDb;
}

export { schema };
