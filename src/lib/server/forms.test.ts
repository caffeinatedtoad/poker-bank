import { describe, expect, it } from 'vitest';
import { cents, id, name } from './forms';

const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('form readers', () => {
	it('cleans names and enforces length', () => {
		expect(name(form({ name: '  Big   Al ' }))).toBe('Big Al');
		expect(name(form({ name: '   ' }))).toBeNull();
		expect(name(form({}))).toBeNull();
		expect(name(form({ name: 'x'.repeat(41) }))).toBeNull();
	});

	it('only accepts positive integer ids', () => {
		expect(id(form({ playerId: '7' }), 'playerId')).toBe(7);
		for (const bad of ['', '0', '-1', '1.5', 'abc']) {
			expect(id(form({ playerId: bad }), 'playerId')).toBeNull();
		}
	});

	it('rejects non-positive amounts only when asked', () => {
		expect(cents(form({ amount: '-5' }), 'amount')).toBe(-500);
		expect(cents(form({ amount: '-5' }), 'amount', { positive: true })).toBeNull();
		expect(cents(form({ amount: '0' }), 'amount', { positive: true })).toBeNull();
		expect(cents(form({ amount: '20' }), 'amount', { positive: true })).toBe(2000);
	});
});
