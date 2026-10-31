// Money is always an integer number of cents. Floats can't represent 0.10 exactly.

/** Parses user input like "20", "12.5", "-7.25" into cents. Returns null if it isn't a valid amount. */
export function parseCents(input: string): number | null {
	const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
	if (!match) return null;
	const [, minus, whole, frac = ''] = match;
	const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
	if (!Number.isSafeInteger(cents)) return null;
	return minus ? -cents : cents;
}

/** Formats cents for display: 2000 → "$20", 1250 → "$12.50", -500 → "-$5". */
export function formatCents(cents: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: cents % 100 === 0 ? 0 : 2
	}).format(cents / 100);
}

/** Cents as an editable input value: 2000 → "20", 1250 → "12.50". The inverse of parseCents. */
export function toInputValue(cents: number): string {
	return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}
