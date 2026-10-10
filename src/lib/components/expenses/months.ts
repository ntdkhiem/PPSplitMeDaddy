export interface MonthGroup<T> {
	/** YYYY-MM */
	key: string;
	label: string;
	totalCents: number;
	expenses: T[];
}

/** "2026-10" -> "October 2026". */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-').map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Groups expenses (already sorted by date, newest first) into consecutive month groups with totals. */
export function groupByMonth<T extends { date: string; amountCents: number }>(
	expenses: T[]
): MonthGroup<T>[] {
	const groups: MonthGroup<T>[] = [];
	for (const e of expenses) {
		const key = e.date.slice(0, 7);
		let group = groups.at(-1);
		if (!group || group.key !== key) {
			group = { key, label: monthLabel(key), totalCents: 0, expenses: [] };
			groups.push(group);
		}
		group.totalCents += e.amountCents;
		group.expenses.push(e);
	}
	return groups;
}
