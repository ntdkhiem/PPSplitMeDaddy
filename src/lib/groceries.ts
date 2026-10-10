export interface BudgetRow {
	/** first month (YYYY-MM) the budget applies to */
	period: string;
	amountCents: number;
}

export interface GroceryFund {
	/** null = no budget set yet */
	budgetCents: number | null;
	/** posted grocery spending; refunds (negative amounts) reduce it */
	spentCents: number;
	/** budget − spent (negative = over budget); null when there is no budget */
	remainingCents: number | null;
}

/** Budget in effect for `period`: the row with the greatest period <= `period`, or null. */
export function budgetFor(budgets: BudgetRow[], period: string): number | null {
	let best: BudgetRow | undefined;
	for (const b of budgets) {
		if (b.period <= period && (!best || b.period > best.period)) best = b;
	}
	return best ? best.amountCents : null;
}

/** Fund summary for one month's posted grocery expenses against its budget. */
export function groceryFund(
	budgetCents: number | null,
	expenses: { amountCents: number }[]
): GroceryFund {
	const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
	return {
		budgetCents,
		spentCents,
		remainingCents: budgetCents === null ? null : budgetCents - spentCents
	};
}
