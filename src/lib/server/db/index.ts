import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

/** Opens a SQLite database (file path or ':memory:') and applies migrations. */
export function openDb(path: string): DB {
	if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: resolve(process.env.MIGRATIONS_DIR ?? 'drizzle') });
	return db;
}

let instance: DB | undefined;

/** App-wide database, lazily opened at DATABASE_PATH (default ./data/app.db). */
export function getDb(): DB {
	instance ??= openDb(process.env.DATABASE_PATH ?? 'data/app.db');
	return instance;
}

/** Test helper: fresh in-memory database with migrations applied. */
export function createTestDb(): DB {
	return openDb(':memory:');
}

export { schema };
