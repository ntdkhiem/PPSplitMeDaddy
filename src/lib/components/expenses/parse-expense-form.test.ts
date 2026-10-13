import { describe, expect, it } from 'vitest';
import { parseExpenseForm } from './parse-expense-form';

function form(fields: Record<string, string>): FormData {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
}

const base = {
	description: 'Store return',
	amount: '50',
	date: '2026-03-01',
	payerId: 'a',
	splitMode: 'exact'
};
const ids = new Set(['a', 'b']);

describe('parseExpenseForm', () => {
	it('gives a refund’s exact amounts the refund’s sign, so they can be typed as positive', () => {
		const parsed = parseExpenseForm(
			form({
				...base,
				isRefund: 'on',
				participants: JSON.stringify([
					{ memberId: 'a', amountCents: 3000 },
					{ memberId: 'b', amountCents: 2000 }
				])
			}),
			ids
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.data.amountCents).toBe(-5000);
		expect(parsed.data.participants.map((p) => p.amountCents)).toEqual([-3000, -2000]);
	});

	it('keeps exact amounts positive for a normal expense even if typed negative', () => {
		const parsed = parseExpenseForm(
			form({
				...base,
				participants: JSON.stringify([
					{ memberId: 'a', amountCents: -3000 },
					{ memberId: 'b', amountCents: 2000 }
				])
			}),
			ids
		);
		expect(parsed.ok && parsed.data.participants.map((p) => p.amountCents)).toEqual([3000, 2000]);
	});

	it('rejects an impossible date', () => {
		const parsed = parseExpenseForm(
			form({
				...base,
				date: '2026-02-31',
				participants: JSON.stringify([{ memberId: 'a', amountCents: 5000 }])
			}),
			ids
		);
		expect(parsed.ok).toBe(false);
		expect(parsed.errors.date).toBe('Enter a valid date');
	});
});
