import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Each table definition is both the DDL (drizzle-kit turns it into a migration) and the
// TypeScript type of its rows, like a Go struct with `db:"..."` tags that also generates SQL.

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const groups = sqliteTable('groups', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	bankEmail: text('bank_email').notNull(),
	defaultBuyinCents: integer('default_buyin_cents').notNull(),
	createdAt: createdAt()
});

export const players = sqliteTable('players', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	groupId: integer('group_id')
		.notNull()
		.references(() => groups.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	createdAt: createdAt()
});

// Append-only ledger: a player's balance is SUM(delta_cents). Nothing is ever updated in place.
export const entries = sqliteTable('entries', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	playerId: integer('player_id')
		.notNull()
		.references(() => players.id, { onDelete: 'cascade' }),
	deltaCents: integer('delta_cents').notNull(),
	kind: text('kind', { enum: ['buyin', 'cashout', 'clear', 'set'] }).notNull(),
	byEmail: text('by_email').notNull(),
	createdAt: createdAt()
});

export type Group = typeof groups.$inferSelect;
