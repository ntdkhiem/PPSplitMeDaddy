import { describe, expect, it } from 'vitest';
import { budgetFor } from '$lib/groceries';
import { createTestDb } from '../db';
import { createMember } from './members';
import { createExpense, listExpenses, softDeleteExpense } from './expenses';
import { listGroceryBudgets, setGroceryBudget } from './groceries';

describe('grocery budgets', () => {
	it('upserts per period and carries forward', async () => {
		const db = await createTestDb();
		const a = await createMember(db, { name: 'Tyler' });
		await setGroceryBudget(db, '2026-01', 40000, a.id);
		await setGroceryBudget(db, '2026-03', 45000, a.id);
		await setGroceryBudget(db, '2026-03', 50000, null);

		const budgets = await listGroceryBudgets(db);
		expect(budgets).toEqual([
			{ period: '2026-01', amountCents: 40000 },
			{ period: '2026-03', amountCents: 50000 }
		]);
		expect(budgetFor(budgets, '2026-02')).toBe(40000);
		expect(budgetFor(budgets, '2026-10')).toBe(50000);
	});

	it('rejects negative or fractional budgets', async () => {
		const db = await createTestDb();
		await expect(setGroceryBudget(db, '2026-01', -1, null)).rejects.toThrow();
		await expect(setGroceryBudget(db, '2026-01', 1.5, null)).rejects.toThrow();
	});
});

describe('listExpenses category filter', () => {
	it('matches the category exactly, ignoring case, and skips deleted expenses', async () => {
		const db = await createTestDb();
		const a = await createMember(db, { name: 'Tyler' });
		const base = {
			amountCents: 1000,
			date: '2026-10-01',
			payerId: a.id,
			splitMode: 'equal' as const,
			participants: [{ memberId: a.id }]
		};
		await createExpense(db, { ...base, description: 'Costco', category: 'Groceries' }, a.id);
		await createExpense(db, { ...base, description: 'TJs', category: 'groceries' }, a.id);
		await createExpense(db, { ...base, description: 'Groceries bag', category: 'Household' }, a.id);
		await createExpense(db, { ...base, description: 'Uncategorized' }, a.id);
		const gone = await createExpense(
			db,
			{ ...base, description: 'Deleted', category: 'Groceries' },
			a.id
		);
		await softDeleteExpense(db, gone.id);

		const rows = await listExpenses(db, { category: 'Groceries' });
		expect(rows.map((e) => e.description).sort()).toEqual(['Costco', 'TJs']);
	});
});
