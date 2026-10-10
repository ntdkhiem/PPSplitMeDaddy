import { asc } from 'drizzle-orm';
import type { BudgetRow } from '$lib/groceries';
import type { DB } from '../db';
import { groceryBudgets } from '../db/schema';

/** All budget rows, oldest period first. Use budgetFor() from $lib/groceries to pick a month's budget. */
export async function listGroceryBudgets(db: DB): Promise<BudgetRow[]> {
	return db
		.select({ period: groceryBudgets.period, amountCents: groceryBudgets.amountCents })
		.from(groceryBudgets)
		.orderBy(asc(groceryBudgets.period))
		.all();
}

/** Sets the budget from `period` (YYYY-MM) onward, replacing any row for that same period. */
export async function setGroceryBudget(
	db: DB,
	period: string,
	amountCents: number,
	updatedBy: string | null
): Promise<void> {
	if (!Number.isInteger(amountCents) || amountCents < 0)
		throw new Error('Budget must be a non-negative number of cents');
	await db
		.insert(groceryBudgets)
		.values({ period, amountCents, updatedBy })
		.onConflictDoUpdate({
			target: groceryBudgets.period,
			set: { amountCents, updatedBy, createdAt: new Date() }
		})
		.run();
}
