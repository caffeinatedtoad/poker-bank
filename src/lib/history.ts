import { formatCents } from '#lib/money.ts';

// Helpers for a player's history, shared by the history list and the chart. Browser-safe (no server code).

/** One ledger entry as the group page's load() returns it (see `listGroupEntries` in ledger.ts). */
export type HistoryEntry = {
	id: number;
	kind: 'buyin' | 'cashout' | 'clear' | 'set';
	deltaCents: number;
	createdAt: Date;
};

export const KIND_LABEL = { buyin: 'Buy-in', cashout: 'Cash out', clear: 'Cleared', set: 'Set' };

/** A change with its sign, for the history list: +$20, −$15. */
export function signedCents(cents: number): string {
	return cents < 0 ? `−${formatCents(-cents)}` : `+${formatCents(cents)}`;
}

/** "9:42 PM" today, "Fri 9:42 PM" this past week, "Oct 3" before that, in the viewer's time zone. */
export function when(date: Date): string {
	const time = { hour: 'numeric', minute: '2-digit' } as const;
	if (date.toDateString() === new Date().toDateString()) {
		return date.toLocaleTimeString(undefined, time);
	}
	const recent = Date.now() - date.getTime() < 6 * 24 * 60 * 60 * 1000;
	return date.toLocaleString(
		undefined,
		recent ? { weekday: 'short', ...time } : { month: 'short', day: 'numeric' }
	);
}

/**
 * The player's running result after each change, oldest first, from their side: positive means up
 * (in the green), negative means down. That's the balance with its sign flipped. The first point is
 * the result before the first listed change, worked back from the current balance, so it stays right
 * even when the history list is cut off at its limit.
 */
export function resultSeries<T extends { deltaCents: number }>(
	newestFirst: T[],
	balanceCents: number
) {
	const changes = [...newestFirst].reverse();
	let balance = balanceCents - changes.reduce((sum, c) => sum + c.deltaCents, 0);
	const points: { resultCents: number; change: T | null }[] = [
		{ resultCents: 0 - balance, change: null }
	];
	for (const change of changes) {
		balance += change.deltaCents;
		points.push({ resultCents: 0 - balance, change }); // 0 - x, not -x: -0 would print as "-$0"
	}
	return points;
}

/**
 * Rounds up to a clean axis value: the next multiple of half a power of ten dollars.
 * $17 → $20, $45 → $45, $60 → $60, $1,234.50 → $1,500. Tight enough not to waste chart height.
 */
export function niceCeil(cents: number): number {
	if (cents <= 0) return 0;
	const dollars = cents / 100;
	const half = 10 ** Math.floor(Math.log10(dollars)) / 2;
	return Math.round(Math.ceil(dollars / half - 1e-9) * half * 100); // 1e-9: float noise on exact multiples
}
