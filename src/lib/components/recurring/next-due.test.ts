import { describe, expect, it } from 'vitest';
import { nextDueDate } from './next-due';

describe('nextDueDate', () => {
	it('returns this month due date when it has not passed yet', () => {
		expect(nextDueDate({ startPeriod: '2026-01', dayOfMonth: 20 }, '2026-09-14')).toBe(
			'2026-09-20'
		);
	});

	it('returns todays date when due today', () => {
		expect(nextDueDate({ startPeriod: '2026-01', dayOfMonth: 14 }, '2026-09-14')).toBe(
			'2026-09-14'
		);
	});

	it('rolls to next month when this months due date already passed', () => {
		expect(nextDueDate({ startPeriod: '2026-01', dayOfMonth: 5 }, '2026-09-14')).toBe('2026-10-05');
	});

	it('uses the future start period when the template has not started yet', () => {
		expect(nextDueDate({ startPeriod: '2026-12', dayOfMonth: 1 }, '2026-09-14')).toBe('2026-12-01');
	});

	it('rolls over the year boundary', () => {
		expect(nextDueDate({ startPeriod: '2026-01', dayOfMonth: 5 }, '2026-12-14')).toBe('2027-01-05');
	});

	it('rolls over the year boundary when the future start period is in january', () => {
		expect(nextDueDate({ startPeriod: '2027-01', dayOfMonth: 10 }, '2026-12-14')).toBe(
			'2027-01-10'
		);
	});
});
