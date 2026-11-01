import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from './db/open';
import { entries, players } from './db/schema';

const balance = sql<number>`coalesce(sum(${entries.deltaCents}), 0)`;

/** Players in a group with their current balance (what they owe the bank), sorted by name. */
export function listPlayers(db: DB, groupId: number) {
	return db
		.select({ id: players.id, name: players.name, balanceCents: balance })
		.from(players)
		.leftJoin(entries, eq(entries.playerId, players.id))
		.where(eq(players.groupId, groupId))
		.groupBy(players.id)
		.orderBy(players.name)
		.all();
}

// shortcut: keeps the newest 100 changes per player; add paging if a player's history ever outgrows that.
const HISTORY_LIMIT = 100;

/** Every player's ledger entries in a group, newest first, keyed by player id. Players with none are absent. */
export function listGroupEntries(db: DB, groupId: number) {
	const rows = db
		.select({
			playerId: entries.playerId,
			id: entries.id,
			kind: entries.kind,
			deltaCents: entries.deltaCents,
			createdAt: entries.createdAt
		})
		.from(entries)
		.innerJoin(players, eq(entries.playerId, players.id))
		.where(eq(players.groupId, groupId))
		.orderBy(desc(entries.id))
		.all();
	const byPlayer: Record<number, Omit<(typeof rows)[number], 'playerId'>[]> = {};
	for (const { playerId, ...entry } of rows) {
		const list = (byPlayer[playerId] ??= []);
		if (list.length < HISTORY_LIMIT) list.push(entry);
	}
	return byPlayer;
}

export function addPlayer(db: DB, groupId: number, name: string): number {
	return db.insert(players).values({ groupId, name }).returning({ id: players.id }).get().id;
}

export function removePlayer(db: DB, groupId: number, playerId: number): void {
	requirePlayer(db, groupId, playerId);
	db.delete(players).where(eq(players.id, playerId)).run(); // cascades to the player's entries
}

/** Adds `cents` to the player's debt. Returns the new entry's id so the bank can undo a mis-tap. */
export function buyIn(
	db: DB,
	groupId: number,
	playerId: number,
	cents: number,
	by: string
): number {
	requirePlayer(db, groupId, playerId);
	return db
		.insert(entries)
		.values({ playerId, deltaCents: cents, kind: 'buyin', byEmail: by })
		.returning({ id: entries.id })
		.get().id;
}

/**
 * Deletes a buy-in or cash-out that was entered by mistake, however long ago, so it reads as never
 * having happened (rather than appending a reversal). Later entries are untouched, so the balance moves
 * by exactly that entry. Clears and sets aren't removable: they were worked out from the balance at the
 * time, so take them back with another set. Only from this group.
 */
export function removeEntry(db: DB, groupId: number, entryId: number): void {
	const found = db
		.select({ id: entries.id })
		.from(entries)
		.innerJoin(players, eq(players.id, entries.playerId))
		.where(
			and(
				eq(entries.id, entryId),
				inArray(entries.kind, ['buyin', 'cashout']),
				eq(players.groupId, groupId)
			)
		)
		.get();
	if (!found) error(404, 'That entry is already gone');
	db.delete(entries).where(eq(entries.id, entryId)).run();
}

/**
 * Credits the chips a player ended the night with. Bought in $10 and cashing out $15
 * leaves a balance of -$5, meaning the player is $5 in the green.
 */
export function cashOut(
	db: DB,
	groupId: number,
	playerId: number,
	cents: number,
	by: string
): void {
	requirePlayer(db, groupId, playerId);
	db.insert(entries).values({ playerId, deltaCents: -cents, kind: 'cashout', byEmail: by }).run();
}

/**
 * Sets the player's balance to exactly `targetCents` by appending the difference,
 * so the history is kept. Read and write happen in one transaction so a concurrent
 * buy-in can't slip in between and get lost.
 */
export function moveTo(
	db: DB,
	groupId: number,
	playerId: number,
	targetCents: number,
	kind: 'clear' | 'set',
	by: string
): void {
	db.transaction((tx) => {
		requirePlayer(tx, groupId, playerId);
		const delta = targetCents - balanceOf(tx, playerId);
		if (delta !== 0) {
			tx.insert(entries).values({ playerId, deltaCents: delta, kind, byEmail: by }).run();
		}
	});
}

export function balanceOf(db: DB, playerId: number): number {
	return db.select({ balance }).from(entries).where(eq(entries.playerId, playerId)).get()!.balance;
}

// Player ids come from form posts, so check the player really belongs to the group whose
// bank is acting. Otherwise one bank could edit another group's players by changing the id.
function requirePlayer(db: DB, groupId: number, playerId: number): void {
	const found = db
		.select({ id: players.id })
		.from(players)
		.where(and(eq(players.id, playerId), eq(players.groupId, groupId)))
		.get();
	if (!found) error(404, 'Player not found in this group');
}
