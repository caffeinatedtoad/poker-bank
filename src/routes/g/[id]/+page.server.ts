import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getGroup } from '#lib/server/groups.ts';
import { listPlayers } from '#lib/server/ledger.ts';
import type { PageServerLoad } from './$types';

/** The `[id]` path segment as a positive integer, or a 404. Like strconv.Atoi on r.PathValue("id"). */
function groupIdFrom(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isSafeInteger(id) || id <= 0) error(404, 'Group not found');
	return id;
}

export const load: PageServerLoad = ({ params }) => {
	const group = getGroup(db, groupIdFrom(params));
	return { group, players: listPlayers(db, group.id) };
};
