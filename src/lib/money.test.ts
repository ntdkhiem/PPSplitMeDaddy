import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money';

describe('parseMoney', () => {
	it.each([
		['19.09', 1909],
		['$1,234.5', 123450],
		['30', 3000],
		['-3.25', -325],
		['.5', 50],
		['0', 0]
	])('parses %s', (input, cents) => {
		expect(parseMoney(input)).toBe(cents);
	});

	it.each(['', 'abc', '1.234', '1.2.3', '--1'])('rejects %s', (input) => {
		expect(parseMoney(input)).toBeNull();
	});
});

describe('formatMoney', () => {
	it('formats cents', () => {
		expect(formatMoney(162558)).toBe('$1,625.58');
		expect(formatMoney(-300)).toBe('-$3.00');
	});
});
