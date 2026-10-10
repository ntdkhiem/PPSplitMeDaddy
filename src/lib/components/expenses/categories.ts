/** Category that puts an expense on the /groceries page and counts it against the grocery budget. */
export const GROCERY_CATEGORY = 'Groceries';

/** Distinct, sorted category strings out of a list of expenses (used for the category `<datalist>`). */
export function distinctCategories(expenses: { category: string | null }[]): string[] {
	const set = new Set<string>();
	for (const e of expenses) {
		if (e.category) set.add(e.category);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/** Category suggestions for the expense form: everything in use, plus the grocery category. */
export function categoryOptions(expenses: { category: string | null }[]): string[] {
	return distinctCategories([...expenses, { category: GROCERY_CATEGORY }]);
}
