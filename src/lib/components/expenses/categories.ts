/** Distinct, sorted category strings out of a list of expenses (used for the category `<datalist>`). */
export function distinctCategories(expenses: { category: string | null }[]): string[] {
	const set = new Set<string>();
	for (const e of expenses) {
		if (e.category) set.add(e.category);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}
