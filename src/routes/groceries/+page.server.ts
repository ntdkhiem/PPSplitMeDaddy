import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listExpenses } from '$lib/server/services/expenses';
import { listMembers } from '$lib/server/services/members';
import { listGroceryBudgets, setGroceryBudget } from '$lib/server/services/groceries';
import { GROCERY_CATEGORY } from '$lib/components/expenses/categories';
import { groupByMonth, monthLabel } from '$lib/components/expenses/months';
import { budgetFor, groceryFund } from '$lib/groceries';
import { centsToInput, parseMoney, today } from '$lib/money';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const [all, members, budgets] = await Promise.all([
		listExpenses(db, { category: GROCERY_CATEGORY }),
		listMembers(db, { includeInactive: true }),
		listGroceryBudgets(db)
	]);
	const drafts = all.filter((e) => e.status === 'draft');
	const posted = all.filter((e) => e.status === 'posted');

	const currentPeriod = today().slice(0, 7);
	const groups = groupByMonth(posted).map((g) => ({
		...g,
		budgetCents: budgetFor(budgets, g.key)
	}));
	const thisMonth = posted.filter((e) => e.date.startsWith(currentPeriod));
	const fund = groceryFund(budgetFor(budgets, currentPeriod), thisMonth);

	return {
		fund,
		month: { key: currentPeriod, label: monthLabel(currentPeriod) },
		budgetInput: fund.budgetCents === null ? '' : centsToInput(fund.budgetCents),
		drafts,
		groups,
		members,
		meId: locals.member!.id,
		category: GROCERY_CATEGORY
	};
};

export const actions: Actions = {
	setBudget: async ({ request, locals }) => {
		const form = await request.formData();
		const amount = String(form.get('amount') ?? '');
		const cents = parseMoney(amount);
		if (cents === null || cents < 0) {
			return fail(400, { budgetError: 'Enter a valid amount, e.g. 400', amount });
		}
		// Budgets take effect from the current month; past months keep the budget they had.
		await setGroceryBudget(getDb(), today().slice(0, 7), cents, locals.member!.id);
		return { budgetSaved: true };
	}
};
