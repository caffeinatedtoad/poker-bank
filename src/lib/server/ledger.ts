import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { DB } from './db/open';
import { entries, players } from './db/schema';

const balance = sql<number>`coalesce(sum(${entries.deltaCents}), 0)`;

// True for each player's most recent entry. Only that one can be undone, so removing a buy-in
// can never silently change the result of a later cash-out or set.
const isLatestEntry = sql`${entries.id} = (select max(e2.id) from entries e2 where e2.player_id = ${entries.playerId})`;

/**
 * Players in a group with their current balance (what they owe the bank), sorted by name.
 * `lastBuyIn` is set when the player's most recent change is a buy-in, so the bank can remove it.
 */
export function listPlayers(db: DB, groupId: number) {
	const rows = db
		.select({ id: players.id, name: players.name, balanceCents: balance })
		.from(players)
		.leftJoin(entries, eq(entries.playerId, players.id))
		.where(eq(players.groupId, groupId))
		.groupBy(players.id)
		.orderBy(players.name)
		.all();
	const lastBuyIns = db
		.select({ playerId: entries.playerId, entryId: entries.id, cents: entries.deltaCents })
		.from(entries)
		.innerJoin(players, eq(players.id, entries.playerId))
		.where(and(eq(players.groupId, groupId), eq(entries.kind, 'buyin'), isLatestEntry))
		.all();
	const byPlayer = new Map(
		lastBuyIns.map((b) => [b.playerId, { entryId: b.entryId, cents: b.cents }])
	);
	return rows.map((p) => ({ ...p, lastBuyIn: byPlayer.get(p.id) ?? null }));
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
 * Deletes a buy-in that was tapped by mistake, so it reads as never having happened (rather than
 * appending a reversal). Only a buy-in in this group that is still the player's latest change
 * can be removed. Repeating it steps back through earlier buy-ins.
 */
export function undoBuyIn(db: DB, groupId: number, entryId: number): void {
	const found = db
		.select({ id: entries.id })
		.from(entries)
		.innerJoin(players, eq(players.id, entries.playerId))
		.where(
			and(
				eq(entries.id, entryId),
				eq(entries.kind, 'buyin'),
				eq(players.groupId, groupId),
				isLatestEntry
			)
		)
		.get();
	if (!found) error(404, "That buy-in can't be removed: it's gone, or something changed since");
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
