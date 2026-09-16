import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type DB = LibSQLDatabase<typeof schema>;

/**
 * Opens a libSQL database without migrating. `url` is a Turso URL (`libsql://…`, needs `authToken`),
 * a local file (`file:data/app.db`), or `:memory:`.
 */
export function openDb(url: string, authToken?: string): DB {
	if (url.startsWith('file:') && !url.startsWith('file::memory:')) {
		mkdirSync(dirname(resolve(url.slice('file:'.length))), { recursive: true });
	}
	return drizzle(createClient({ url, authToken, intMode: 'number' }), { schema });
}

/** Applies pending migrations from MIGRATIONS_DIR (default ./drizzle). */
export async function migrateDb(db: DB): Promise<void> {
	await migrate(db, { migrationsFolder: resolve(process.env.MIGRATIONS_DIR ?? 'drizzle') });
}

let instance: DB | undefined;
let migrated: Promise<void> | undefined;

/** App-wide database at DATABASE_URL (+ DATABASE_AUTH_TOKEN); defaults to file:data/app.db. */
export function getDb(): DB {
	instance ??= openDb(
		process.env.DATABASE_URL ?? 'file:data/app.db',
		process.env.DATABASE_AUTH_TOKEN || undefined
	);
	return instance;
}

/**
 * Migrates the app database once per process. On Vercel migrations run at build time
 * (`npm run db:migrate`) because the migration files aren't bundled into functions, so this is a no-op there.
 */
export function ensureMigrated(): Promise<void> {
	if (process.env.VERCEL) return Promise.resolve();
	migrated ??= migrateDb(getDb());
	return migrated;
}

/** Test helper: fresh in-memory database with migrations applied. */
export async function createTestDb(): Promise<DB> {
	const db = openDb(':memory:');
	await db.run('PRAGMA foreign_keys = ON');
	await migrateDb(db);
	return db;
}

export { schema };
