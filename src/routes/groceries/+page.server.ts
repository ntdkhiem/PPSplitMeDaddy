import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getCategoryBalances } from '$lib/server/services/balances';
import { listExpenses } from '$lib/server/services/expenses';
import { getMember, listMembers } from '$lib/server/services/members';
import { createPayment, listPayments } from '$lib/server/services/payments';
import { listGroceryBudgets, setGroceryBudget } from '$lib/server/services/groceries';
import { GROCERY_CATEGORY } from '$lib/components/expenses/categories';
import { groupByMonth, monthLabel } from '$lib/components/expenses/months';
import { budgetFor, groceryFund } from '$lib/groceries';
import { centsToInput, formatMoney, parseMoney, today } from '$lib/money';

const recordSchema = z.object({
	fromId: z.string().min(1),
	toId: z.string().min(1),
	amountCents: z.coerce.number().int().positive()
});

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const [all, members, budgets, { balances, transfers }, payments] = await Promise.all([
		listExpenses(db, { category: GROCERY_CATEGORY }),
		listMembers(db, { includeInactive: true }),
		listGroceryBudgets(db),
		getCategoryBalances(db, GROCERY_CATEGORY),
		listPayments(db, { category: GROCERY_CATEGORY, limit: 10 })
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
		balances,
		transfers,
		payments,
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
	},

	/** Records a settle-up payment tagged as groceries (it counts in the overall balances too). */
	recordPayment: async ({ request, locals }) => {
		const db = getDb();
		const parsed = recordSchema.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { paymentError: 'Invalid payment' });
		const { fromId, toId, amountCents } = parsed.data;
		if (fromId === toId) return fail(400, { paymentError: 'Payer and recipient must differ' });
		const [from, to] = await Promise.all([getMember(db, fromId), getMember(db, toId)]);
		if (!from || !to) return fail(400, { paymentError: 'Unknown member' });

		await createPayment(
			db,
			{ fromId, toId, amountCents, date: today(), category: GROCERY_CATEGORY },
			locals.member!.id
		);
		return {
			paymentSuccess: `Recorded ${from.name} → ${to.name}: ${formatMoney(amountCents)}`
		};
	}
};
