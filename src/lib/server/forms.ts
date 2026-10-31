import { parseCents } from '#lib/money.ts';

// Readers for posted form fields, like r.FormValue plus parsing. Each returns null when the
// field is missing or invalid, and the action turns that into a fail(400, ...) for the user.

export const MAX_NAME = 40;

export function text(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

/** A display name: 1 to MAX_NAME characters after trimming. */
export function name(form: FormData, key = 'name'): string | null {
	const value = text(form, key).replace(/\s+/g, ' ');
	return value.length > 0 && value.length <= MAX_NAME ? value : null;
}

/** A positive whole-number id (e.g. a player id from a hidden input). */
export function id(form: FormData, key: string): number | null {
	const value = Number(text(form, key));
	return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** A money amount in cents; pass `positive` to reject zero and negatives. */
export function cents(
	form: FormData,
	key: string,
	opts: { positive?: boolean } = {}
): number | null {
	const value = parseCents(text(form, key));
	if (value === null || (opts.positive && value <= 0)) return null;
	return value;
}
