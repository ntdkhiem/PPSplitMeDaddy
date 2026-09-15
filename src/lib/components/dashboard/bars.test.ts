import { describe, expect, it } from 'vitest';
import { barWidthPct, maxAbsBalance } from './bars';

describe('barWidthPct', () => {
	it('scales relative to the max', () => {
		expect(barWidthPct(50, 100)).toBe(50);
		expect(barWidthPct(-100, 100)).toBe(100);
		expect(barWidthPct(0, 100)).toBe(0);
	});

	it('returns 0 when there is nothing to scale against', () => {
		expect(barWidthPct(50, 0)).toBe(0);
		expect(barWidthPct(0, 0)).toBe(0);
	});

	it('clamps to 100', () => {
		expect(barWidthPct(150, 100)).toBe(100);
	});
});

describe('maxAbsBalance', () => {
	it('finds the largest absolute value', () => {
		expect(maxAbsBalance([50, -200, 100])).toBe(200);
	});

	it('returns 0 for empty input', () => {
		expect(maxAbsBalance([])).toBe(0);
	});

	it('returns 0 when all balances are 0', () => {
		expect(maxAbsBalance([0, 0])).toBe(0);
	});
});
