import { describe, expect, it } from 'vitest';
import { formatCents, parseCents, toInputValue } from './money';

// it.each is Vitest's table-driven test, like `for _, tc := range cases { t.Run(...) }`.
describe('parseCents', () => {
	it.each([
		['20', 2000],
		['12.5', 1250],
		['12.50', 1250],
		['0.05', 5],
		[' 7 ', 700],
		['-5', -500],
		['-7.25', -725],
		['0', 0]
	])('parses %j as %d', (input, want) => {
		expect(parseCents(input)).toBe(want);
	});

	it.each(['', ' ', 'abc', '1.234', '1.', '.5', '$5', '1,000', '--5', '9'.repeat(20)])(
		'rejects %j',
		(input) => {
			expect(parseCents(input)).toBeNull();
		}
	);
});

describe('formatCents', () => {
	it.each([
		[2000, '$20'],
		[1250, '$12.50'],
		[5, '$0.05'],
		[0, '$0'],
		[-500, '-$5'],
		[123456, '$1,234.56']
	])('formats %d as %j', (cents, want) => {
		expect(formatCents(cents)).toBe(want);
	});
});

describe('toInputValue', () => {
	it.each([2000, 1250, 5, 0, -725, 123456])('round-trips %d through parseCents', (cents) => {
		expect(parseCents(toInputValue(cents))).toBe(cents);
	});
});
