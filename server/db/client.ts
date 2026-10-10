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

type Conn = { db: Db; kind: 'postgres' | 'pglite'; close: () => Promise<void> };
// Kept on globalThis so dev-server reloads reuse the one open database.
const g = globalThis as unknown as { __voyageDb?: Promise<Conn> | null };

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const sql = postgres(url, { max: 5, prepare: false }); // prepare:false works with poolers (Supabase/Neon)
    const db = drizzle(sql, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as Db, kind: 'postgres' as const, close: () => sql.end() };
  }

  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. Add your Supabase or Neon connection string in Vercel settings.');
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGLITE_DIR ?? path.resolve(process.cwd(), '.data/pglite');
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, kind: 'pglite' as const, close: () => client.close() };
}

/** The database, connected and migrated. Safe to call from every request. */
export function getDb(): Promise<Conn> {
  g.__voyageDb ??= connect().catch((err) => {
    g.__voyageDb = null; // allow a retry on the next request
    throw err;
  });
  return g.__voyageDb;
}

export { schema };
