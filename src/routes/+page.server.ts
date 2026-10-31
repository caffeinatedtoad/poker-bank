import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import * as forms from '#lib/server/forms.ts';
import { createGroup, listGroups } from '#lib/server/groups.ts';
import type { Actions, PageServerLoad } from './$types';

// load() runs on the server for every GET of `/`. Whatever it returns becomes `data` in +page.svelte.
export const load: PageServerLoad = () => {
	return { groups: listGroups(db) };
};

// actions are POST handlers. <form method="POST" action="?/create"> calls `create`.
// Whatever fail() returns becomes `form` in +page.svelte, so the page can show the error.
export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = forms.name(form);
		const buyin = forms.cents(form, 'defaultBuyin', { positive: true });
		if (!name) return fail(400, { error: `Name the group (up to ${forms.MAX_NAME} characters).` });
		if (!buyin) return fail(400, { error: 'Enter a buy-in amount above zero, like 20.' });

		const id = createGroup(db, { name, bankEmail: locals.user, defaultBuyinCents: buyin });
		redirect(303, `/g/${id}`); // 303 See Other: the POST/redirect/GET pattern
	}
};
