import { db } from '#lib/server/db/index.ts';
import { listGroups } from '#lib/server/groups.ts';
import type { PageServerLoad } from './$types';

// load() runs on the server for every GET of `/`. Whatever it returns becomes `data` in +page.svelte.
export const load: PageServerLoad = () => {
	return { groups: listGroups(db) };
};
