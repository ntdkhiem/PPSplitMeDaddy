import { describe, expect, it } from 'vitest';
import { formatMoney, localDate, parseMoney } from './money';

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

describe('localDate', () => {
	it('uses APP_TZ when set, so a UTC server still uses the household date', () => {
		const before = process.env.APP_TZ;
		try {
			// 2026-03-01 05:30 UTC is still Feb 28 in Los Angeles.
			const d = new Date(Date.UTC(2026, 2, 1, 5, 30));
			process.env.APP_TZ = 'America/Los_Angeles';
			expect(localDate(d)).toBe('2026-02-28');
			process.env.APP_TZ = 'UTC';
			expect(localDate(d)).toBe('2026-03-01');
		} finally {
			if (before === undefined) delete process.env.APP_TZ;
			else process.env.APP_TZ = before;
		}
	});
});
