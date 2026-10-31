import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getGroupFromParam } from '#lib/server/groups.ts';
import { listEntries } from '#lib/server/ledger.ts';
import type { RequestHandler } from './$types';

// A plain JSON endpoint, GET /g/12/history/34, like an http.HandlerFunc that writes json.Marshal output.
// The page fetches it when a player's sheet opens, so it isn't re-sent with every 5-second refresh.
// Anyone signed in may read it (everyone can see balances). Changes still go through bank-only actions.
export const GET: RequestHandler = ({ params }) => {
	const group = getGroupFromParam(db, params.id);
	const playerId = Number(params.playerId);
	if (!Number.isSafeInteger(playerId) || playerId <= 0) error(404, 'Player not found');
	return json(listEntries(db, group.id, playerId));
};
