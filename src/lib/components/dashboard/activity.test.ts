import { describe, expect, it } from 'vitest';
import { mergeActivity, type ActivityExpense, type ActivityPayment } from './activity';

function expense(overrides: Partial<ActivityExpense> = {}): ActivityExpense {
	return {
		kind: 'expense',
		id: 'e1',
		date: '2026-08-01',
		createdAt: 1000,
		payerId: 'm1',
		amountCents: 500,
		description: 'Groceries',
		...overrides
	};
}

function payment(overrides: Partial<ActivityPayment> = {}): ActivityPayment {
	return {
		kind: 'payment',
		id: 'p1',
		date: '2026-08-01',
		createdAt: 1000,
		fromId: 'm1',
		toId: 'm2',
		amountCents: 200,
		...overrides
	};
}

describe('mergeActivity', () => {
	it('sorts by date desc, then createdAt desc', () => {
		const e1 = expense({ id: 'e1', date: '2026-08-01', createdAt: 100 });
		const e2 = expense({ id: 'e2', date: '2026-08-03', createdAt: 100 });
		const p1 = payment({ id: 'p1', date: '2026-08-02', createdAt: 200 });
		const p2 = payment({ id: 'p2', date: '2026-08-01', createdAt: 500 });

		const result = mergeActivity([e1, e2], [p1, p2]);

		expect(result.map((r) => r.id)).toEqual(['e2', 'p1', 'p2', 'e1']);
	});

	it('limits the result', () => {
		const expenses = Array.from({ length: 5 }, (_, i) =>
			expense({ id: `e${i}`, date: `2026-08-0${i + 1}` })
		);
		const payments = Array.from({ length: 5 }, (_, i) =>
			payment({ id: `p${i}`, date: `2026-08-1${i}` })
		);

		const result = mergeActivity(expenses, payments, 3);

		expect(result).toHaveLength(3);
		// newest dates come from the payments (2026-08-1x)
		expect(result.map((r) => r.id)).toEqual(['p4', 'p3', 'p2']);
	});

	it('handles empty input', () => {
		expect(mergeActivity([], [])).toEqual([]);
	});
});
