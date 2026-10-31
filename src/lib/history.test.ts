import { describe, expect, it } from 'vitest';
import { niceCeil, resultSeries } from './history';

const e = (deltaCents: number) => ({ deltaCents });

describe('resultSeries', () => {
	it('traces buy in 5, rebuy 5, cash out 15 as 0, -5, -10, +5', () => {
		// History comes newest first; the current balance is -500 (5 in the green).
		const points = resultSeries([e(-1500), e(500), e(500)], -500);
		expect(points.map((p) => p.resultCents)).toEqual([0, -500, -1000, 500]);
		expect(points[0].change).toBeNull();
	});

	it('works back to the right start when older history is cut off', () => {
		// Only the last two changes are listed, but the player already owed $30 before them.
		const points = resultSeries([e(-1000), e(2000)], 4000);
		expect(points.map((p) => p.resultCents)).toEqual([-3000, -5000, -4000]);
	});

	it('is a single point with no history', () => {
		expect(resultSeries([], 0)).toEqual([{ resultCents: 0, change: null }]);
	});
});

describe('niceCeil', () => {
	it.each([
		[0, 0],
		[50, 50],
		[1700, 2000],
		[2000, 2000],
		[4500, 4500],
		[6000, 6000],
		[6001, 6500],
		[123450, 150000]
	])('rounds %d up to %d', (cents, want) => {
		expect(niceCeil(cents)).toBe(want);
	});
});
