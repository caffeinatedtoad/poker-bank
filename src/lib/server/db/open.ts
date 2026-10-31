import Database from 'better-sqlite3';
import type { RunResult } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema';

/**
 * Anything you can run queries on: the database itself or a transaction.
 * Service functions take this as their first argument, like `func Foo(db Querier, ...)` in Go,
 * so tests can pass a fresh in-memory database.
 */
export type DB = BaseSQLiteDatabase<'sync', RunResult, typeof schema>;

/** Opens (or creates) the SQLite file at `path` and applies any pending migrations from ./drizzle. */
export function openDb(path: string) {
	const client = new Database(path);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON'); // SQLite ignores REFERENCES / ON DELETE CASCADE without this
	const db = drizzle(client, { schema });
	migrate(db, { migrationsFolder: 'drizzle' }); // relative to the working directory
	return db;
}
