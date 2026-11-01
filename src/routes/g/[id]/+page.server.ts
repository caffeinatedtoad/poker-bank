import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import * as forms from '#lib/server/forms.ts';
import {
	deleteGroup,
	getGroupFromParam,
	renameGroup,
	requireBank,
	setDefaultBuyin
} from '#lib/server/groups.ts';
import {
	addPlayer,
	buyIn,
	cashOut,
	listGroupEntries,
	listPlayers,
	moveTo,
	removeEntry,
	removePlayer
} from '#lib/server/ledger.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const group = getGroupFromParam(db, params.id);
	// Every player's history comes along with each 5-second refresh: it draws the chart behind each
	// row and fills the ⋯ sheet, so both stay current without a separate fetch.
	return { group, players: listPlayers(db, group.id), history: listGroupEntries(db, group.id) };
};

/** Loads the group and throws 403 unless the signed-in user is its bank. First line of every action. */
function bankGroup(params: { id: string }, user: string) {
	const group = getGroupFromParam(db, params.id);
	requireBank(group, user);
	return group;
}

const badPlayer = () =>
	fail(400, { error: 'That player is missing from the form. Reload and try again.' });

export const actions: Actions = {
	buyin: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const form = await request.formData();
		const playerId = forms.id(form, 'playerId');
		const amount = forms.cents(form, 'amount', { positive: true });
		if (!playerId) return badPlayer();
		if (!amount) return fail(400, { error: 'Enter a buy-in amount above zero, like 20.' });
		// Returned data reaches the page's use:enhance callback, which offers an Undo toast.
		return { entryId: buyIn(db, group.id, playerId, amount, locals.user) };
	},

	removeEntry: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const entryId = forms.id(await request.formData(), 'entryId');
		if (!entryId)
			return fail(400, { error: 'That entry is missing from the form. Reload and try again.' });
		removeEntry(db, group.id, entryId);
	},

	cashout: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const form = await request.formData();
		const playerId = forms.id(form, 'playerId');
		const amount = forms.cents(form, 'amount', { positive: true });
		if (!playerId) return badPlayer();
		if (!amount) return fail(400, { error: 'Enter what they ended with, like 15.' });
		cashOut(db, group.id, playerId, amount, locals.user);
	},

	clear: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const playerId = forms.id(await request.formData(), 'playerId');
		if (!playerId) return badPlayer();
		moveTo(db, group.id, playerId, 0, 'clear', locals.user);
	},

	set: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const form = await request.formData();
		const playerId = forms.id(form, 'playerId');
		const value = forms.cents(form, 'value');
		if (!playerId) return badPlayer();
		if (value === null) return fail(400, { error: 'Enter an amount like 40 or -12.50.' });
		moveTo(db, group.id, playerId, value, 'set', locals.user);
	},

	addPlayer: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const name = forms.name(await request.formData());
		if (!name)
			return fail(400, { error: `Enter a player name (up to ${forms.MAX_NAME} characters).` });
		addPlayer(db, group.id, name);
	},

	removePlayer: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const playerId = forms.id(await request.formData(), 'playerId');
		if (!playerId) return badPlayer();
		removePlayer(db, group.id, playerId);
	},

	setDefault: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const amount = forms.cents(await request.formData(), 'amount', { positive: true });
		if (!amount) return fail(400, { error: 'Enter a buy-in amount above zero, like 20.' });
		setDefaultBuyin(db, group.id, amount);
	},

	rename: async ({ params, locals, request }) => {
		const group = bankGroup(params, locals.user);
		const name = forms.name(await request.formData());
		if (!name) return fail(400, { error: `Name the group (up to ${forms.MAX_NAME} characters).` });
		renameGroup(db, group.id, name);
	},

	deleteGroup: ({ params, locals }) => {
		const group = bankGroup(params, locals.user);
		deleteGroup(db, group.id);
		redirect(303, '/'); // the home page lists it under "Deleted groups" with a Restore button
	}
};
