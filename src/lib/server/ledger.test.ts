import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db/open';
import { entries } from './db/schema';
import { createGroup, getGroup, listGroups, requireBank } from './groups';
import {
	addPlayer,
	balanceOf,
	buyIn,
	cashOut,
	listPlayers,
	moveTo,
	removePlayer,
	listEntries,
	removeBuyIn
} from './ledger';

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

	it('cashes out: buy in 5, rebuy 5, end with 15 is 5 in the green', () => {
		buyIn(db, groupId, alice, 500, BANK);
		buyIn(db, groupId, alice, 500, BANK);
		cashOut(db, groupId, alice, 1500, BANK);
		expect(balanceOf(db, alice)).toBe(-500);
	});

	it('cashes out: ending with less than bought in still owes the difference', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		cashOut(db, groupId, alice, 1200, BANK);
		expect(balanceOf(db, alice)).toBe(800);
	});

	it('removes a mistaken buy-in', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		const oops = buyIn(db, groupId, alice, 2000, BANK);
		removeBuyIn(db, groupId, oops);
		expect(balanceOf(db, alice)).toBe(2000);
		expect(thrownStatus(() => removeBuyIn(db, groupId, oops))).toBe(404); // already gone
	});

	it('removes several mis-taps in any order, even after a cash-out', () => {
		const real = buyIn(db, groupId, alice, 2000, BANK);
		const oops1 = buyIn(db, groupId, alice, 2000, BANK);
		const oops2 = buyIn(db, groupId, alice, 2000, BANK);
		cashOut(db, groupId, alice, 3000, BANK); // ended with $30 after a real $20 buy-in
		removeBuyIn(db, groupId, oops1);
		removeBuyIn(db, groupId, oops2);
		expect(balanceOf(db, alice)).toBe(-1000); // $10 in the green, as if the mis-taps never happened
		expect(listEntries(db, groupId, alice).map((e) => e.id)).toContain(real);
	});

	it('only removes buy-ins, and only within the group', () => {
		buyIn(db, groupId, alice, 2000, BANK);
		cashOut(db, groupId, alice, 500, BANK);
		const cashout = listEntries(db, groupId, alice).find((e) => e.kind === 'cashout')!.id;
		expect(thrownStatus(() => removeBuyIn(db, groupId, cashout))).toBe(404);
		const buyin = buyIn(db, groupId, alice, 100, BANK);
		const other = createGroup(db, { name: 'Other', bankEmail: 'x@y.z', defaultBuyinCents: 500 });
		expect(thrownStatus(() => removeBuyIn(db, other, buyin))).toBe(404);
		expect(balanceOf(db, alice)).toBe(1600);
	});

	it("lists a player's history newest first, scoped to the group", () => {
		buyIn(db, groupId, alice, 2000, BANK);
		cashOut(db, groupId, alice, 500, BANK);
		moveTo(db, groupId, alice, 0, 'clear', BANK);
		expect(listEntries(db, groupId, alice).map((e) => [e.kind, e.deltaCents])).toEqual([
			['clear', -1500],
			['cashout', -500],
			['buyin', 2000]
		]);
		const other = createGroup(db, { name: 'Other', bankEmail: 'x@y.z', defaultBuyinCents: 500 });
		expect(thrownStatus(() => listEntries(db, other, alice))).toBe(404);
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
		expect(thrownStatus(() => cashOut(db, other, alice, 2000, 'x@y.z'))).toBe(404);
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
