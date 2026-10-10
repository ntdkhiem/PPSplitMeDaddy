import { describe, expect, it } from 'vitest';
import { budgetFor, groceryFund } from './groceries';

describe('budgetFor', () => {
	const budgets = [
		{ period: '2026-03', amountCents: 50000 },
		{ period: '2026-01', amountCents: 40000 }
	];

	it('is null before the first budget', () => {
		expect(budgetFor(budgets, '2025-12')).toBeNull();
		expect(budgetFor([], '2026-01')).toBeNull();
	});

	it('carries the latest budget forward', () => {
		expect(budgetFor(budgets, '2026-01')).toBe(40000);
		expect(budgetFor(budgets, '2026-02')).toBe(40000);
		expect(budgetFor(budgets, '2026-03')).toBe(50000);
		expect(budgetFor(budgets, '2027-07')).toBe(50000);
	});
});

describe('groceryFund', () => {
	it('subtracts spending, with refunds lowering it', () => {
		expect(
			groceryFund(40000, [{ amountCents: 12345 }, { amountCents: 20000 }, { amountCents: -345 }])
		).toEqual({ budgetCents: 40000, spentCents: 32000, remainingCents: 8000 });
	});

	it('goes negative when over budget', () => {
		expect(groceryFund(10000, [{ amountCents: 10001 }]).remainingCents).toBe(-1);
	});

	it('has no remaining amount without a budget', () => {
		expect(groceryFund(null, [{ amountCents: 500 }])).toEqual({
			budgetCents: null,
			spentCents: 500,
			remainingCents: null
		});
	});

	it('handles an empty month', () => {
		expect(groceryFund(40000, [])).toEqual({
			budgetCents: 40000,
			spentCents: 0,
			remainingCents: 40000
		});
	});
});
