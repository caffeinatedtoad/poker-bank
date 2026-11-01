import { error } from '@sveltejs/kit';
import { and, countDistinct, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DB } from './db/open';
import { entries, groups, players, type Group } from './db/schema';

export function createGroup(
	db: DB,
	input: { name: string; bankEmail: string; defaultBuyinCents: number }
): number {
	const row = db.insert(groups).values(input).returning({ id: groups.id }).get();
	return row.id;
}

/** Every group (except deleted ones) with its player count and total owed to the bank. */
export function listGroups(db: DB) {
	return db
		.select({
			id: groups.id,
			name: groups.name,
			bankEmail: groups.bankEmail,
			playerCount: countDistinct(players.id),
			totalCents: sql<number>`coalesce(sum(${entries.deltaCents}), 0)`
		})
		.from(groups)
		.leftJoin(players, eq(players.groupId, groups.id))
		.leftJoin(entries, eq(entries.playerId, players.id))
		.where(isNull(groups.deletedAt))
		.groupBy(groups.id)
		.orderBy(groups.name)
		.all();
}

/** The group with this id, or a 404. Deleted groups 404 too, so every page and action ignores them. */
export function getGroup(db: DB, id: number): Group {
	const group = db
		.select()
		.from(groups)
		.where(and(eq(groups.id, id), isNull(groups.deletedAt)))
		.get();
	if (!group) error(404, 'Group not found');
	return group;
}

/** The group named by a URL segment like the `12` in `/g/12`, or a 404. Like strconv.Atoi on r.PathValue. */
export function getGroupFromParam(db: DB, param: string): Group {
	const id = Number(param);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, 'Group not found');
	return getGroup(db, id);
}

/** Throws 403 unless `user` is this group's bank. Call it at the top of every bank-only action. */
export function requireBank(group: Group, user: string): void {
	if (group.bankEmail !== user) error(403, 'Only the bank can do that');
}

export function setDefaultBuyin(db: DB, groupId: number, cents: number): void {
	db.update(groups).set({ defaultBuyinCents: cents }).where(eq(groups.id, groupId)).run();
}

export function renameGroup(db: DB, groupId: number, name: string): void {
	db.update(groups).set({ name }).where(eq(groups.id, groupId)).run();
}

/** Hides the group from everyone. Players and history are kept so restoreGroup can bring it all back. */
export function deleteGroup(db: DB, groupId: number): void {
	db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, groupId)).run();
}

/** Groups this user deleted as their bank, newest deletion first, so they can restore one. */
export function listDeletedGroups(db: DB, user: string) {
	return db
		.select({ id: groups.id, name: groups.name, deletedAt: groups.deletedAt })
		.from(groups)
		.where(and(eq(groups.bankEmail, user), isNotNull(groups.deletedAt)))
		.orderBy(desc(groups.deletedAt), desc(groups.id))
		.all();
}

/** Un-deletes a group. 404s unless `user` is its bank and it is deleted, since the id comes from a form. */
export function restoreGroup(db: DB, groupId: number, user: string): void {
	const { changes } = db
		.update(groups)
		.set({ deletedAt: null })
		.where(and(eq(groups.id, groupId), eq(groups.bankEmail, user), isNotNull(groups.deletedAt)))
		.run();
	if (changes === 0) error(404, 'No deleted group of yours to restore');
}
