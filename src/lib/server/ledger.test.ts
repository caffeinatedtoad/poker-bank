import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db/open';
import { entries } from './db/schema';
import { createGroup, getGroup, listGroups, requireBank } from './groups';
import { addPlayer, balanceOf, buyIn, listPlayers, moveTo, removePlayer } from './ledger';

const BANK = 'bank@example.com';

let db: ReturnType<typeof openDb>;
let groupId: number;
let alice: number;

// Runs before each test, like a setup helper called at the top of every Go test.
beforeEach(() => {
	db = openDb(':memory:');
	groupId = createGroup(db, { name: 'Friday', bankEmail: BANK, defaultBuyinCents: 2000 });
	alice = addPlayer(db, groupId, 'Alice');
});

/** Runs fn and returns the HTTP status it threw (from SvelteKit's error()), or undefined. */
function thrownStatus(fn: () => unknown): number | undefined {
	try {
		fn();
	} catch (e) {
		return (e as { status?: number }).status;
	}
}

describe('ledger', () => {
	it('starts players at zero', () => {
		expect(balanceOf(db, alice)).toBe(0);
	});

	it('adds up buy-ins', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		buyIn(db, groupId, alice, 1500, BANK);
		expect(balanceOf(db, alice)).toBe(3500);
	});

	it('clears to zero without deleting history', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		buyIn(db, groupId, alice, 2000, BANK);
		moveTo(db, groupId, alice, 0, 'clear', BANK);
		expect(balanceOf(db, alice)).toBe(0);
		expect(
			db
				.select()
				.from(entries)
				.all()
				.map((e) => e.deltaCents)
		).toEqual([2000, 2000, -4000]);
	});

	it.each([
		['above', 6000],
		['below', 500],
		['negative (bank owes player)', -1000]
	])('sets the balance %s the current value', (_, target) => {
		buyIn(db, groupId, alice, 2000, BANK);
		moveTo(db, groupId, alice, target, 'set', BANK);
		expect(balanceOf(db, alice)).toBe(target);
	});

	it('records nothing when set to the current balance', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		moveTo(db, groupId, alice, 2000, 'set', BANK);
		expect(db.select().from(entries).all()).toHaveLength(1);
	});

	it('lists players with balances, sorted by name', () => {
		const bob = addPlayer(db, groupId, 'Bob');
		addPlayer(db, groupId, 'Aaron');
		buyIn(db, groupId, bob, 2000, BANK);
		expect(listPlayers(db, groupId)).toEqual([
			{ id: expect.any(Number), name: 'Aaron', balanceCents: 0 },
			{ id: alice, name: 'Alice', balanceCents: 0 },
			{ id: bob, name: 'Bob', balanceCents: 2000 }
		]);
	});

	it('removes a player and their entries', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		removePlayer(db, groupId, alice);
		expect(listPlayers(db, groupId)).toEqual([]);
		expect(db.select().from(entries).all()).toEqual([]);
	});

	it("rejects players from another group (404), so one bank can't touch another's players", () => {
		const other = createGroup(db, { name: 'Other', bankEmail: 'x@y.z', defaultBuyinCents: 500 });
		expect(thrownStatus(() => buyIn(db, other, alice, 2000, 'x@y.z'))).toBe(404);
		expect(thrownStatus(() => moveTo(db, other, alice, 0, 'clear', 'x@y.z'))).toBe(404);
		expect(thrownStatus(() => removePlayer(db, other, alice))).toBe(404);
		expect(balanceOf(db, alice)).toBe(0);
		expect(listPlayers(db, groupId)).toHaveLength(1);
	});
});

describe('groups', () => {
	it('totals what each group is owed', () => {
		const bob = addPlayer(db, groupId, 'Bob');
		buyIn(db, groupId, alice, 2000, BANK);
		buyIn(db, groupId, bob, 1000, BANK);
		createGroup(db, { name: 'Empty', bankEmail: BANK, defaultBuyinCents: 500 });
		expect(listGroups(db)).toEqual([
			{ id: expect.any(Number), name: 'Empty', bankEmail: BANK, playerCount: 0, totalCents: 0 },
			{ id: groupId, name: 'Friday', bankEmail: BANK, playerCount: 2, totalCents: 3000 }
		]);
	});

	it('404s on a missing group', () => {
		expect(thrownStatus(() => getGroup(db, 999))).toBe(404);
	});

	it('only lets the bank through', () => {
		const group = getGroup(db, groupId);
		expect(thrownStatus(() => requireBank(group, BANK))).toBeUndefined();
		expect(thrownStatus(() => requireBank(group, 'someone@else.com'))).toBe(403);
	});
});
