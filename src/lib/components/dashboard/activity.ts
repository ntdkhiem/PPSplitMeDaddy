/** A posted expense, shaped for the merged activity feed. */
export interface ActivityExpense {
	kind: 'expense';
	id: string;
	date: string;
	/** epoch ms */
	createdAt: number;
	payerId: string;
	amountCents: number;
	description: string;
}

/** A non-deleted payment, shaped for the merged activity feed. */
export interface ActivityPayment {
	kind: 'payment';
	id: string;
	date: string;
	/** epoch ms */
	createdAt: number;
	fromId: string;
	toId: string;
	amountCents: number;
}

export type ActivityItem = ActivityExpense | ActivityPayment;

/**
 * Merges expenses and payments into one feed sorted by date desc, then createdAt desc,
 * and returns at most `limit` items. Input order is otherwise not assumed to be sorted.
 */
export function mergeActivity(
	expenses: ActivityExpense[],
	payments: ActivityPayment[],
	limit = 10
): ActivityItem[] {
	const items: ActivityItem[] = [...expenses, ...payments];
	items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
	return items.slice(0, limit);
}
