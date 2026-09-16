import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb, type DB } from '$lib/server/db';
import { getMember, listMembers, toView } from '$lib/server/services/members';
import {
	getExpense,
	listExpenses,
	softDeleteExpense,
	updateExpense,
	type ExpenseWithShares
} from '$lib/server/services/expenses';
import { SplitError } from '$lib/ledger';
import { distinctCategories } from '$lib/components/expenses/categories';
import { parseExpenseForm } from '$lib/components/expenses/parse-expense-form';

async function loadExpenseOr404(db: DB, id: string): Promise<ExpenseWithShares> {
	const expense = await getExpense(db, id);
	if (!expense) error(404, 'Expense not found');
	return expense;
}

/** Active members plus anyone inactive still referenced by this expense (payer or a share). */
async function memberOptionsFor(db: DB, expense: ExpenseWithShares) {
	const active = await listMembers(db);
	const seen = new Set(active.map((m) => m.id));
	const options = [...active];
	const extraIds = new Set([expense.payerId, ...expense.shares.map((s) => s.memberId)]);
	for (const id of extraIds) {
		if (seen.has(id)) continue;
		const m = await getMember(db, id);
		if (m) {
			options.push({ ...toView(m), name: `${m.name} (inactive)` });
			seen.add(id);
		}
	}
	return options;
}

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const expense = await loadExpenseOr404(db, params.id);
	const [members, expenses] = await Promise.all([memberOptionsFor(db, expense), listExpenses(db)]);
	return {
		expense,
		members,
		categories: distinctCategories(expenses)
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const db = getDb();
		const existing = await loadExpenseOr404(db, params.id);
		const form = await request.formData();

		const allMembers = await listMembers(db, { includeInactive: true });
		const validMemberIds = new Set(allMembers.map((m) => m.id));
		const parsedForm = parseExpenseForm(form, validMemberIds);
		if (!parsedForm.ok) {
			return fail(400, { errors: parsedForm.errors, values: parsedForm.values });
		}

		try {
			await updateExpense(db, existing.id, {
				description: parsedForm.data.description,
				amountCents: parsedForm.data.amountCents,
				date: parsedForm.data.date,
				payerId: parsedForm.data.payerId,
				splitMode: parsedForm.data.splitMode,
				participants: parsedForm.data.participants,
				category: parsedForm.data.category,
				notes: parsedForm.data.notes,
				status: 'posted'
			});
		} catch (err) {
			if (err instanceof SplitError) {
				return fail(400, {
					errors: { participants: err.message },
					values: parsedForm.values
				});
			}
			throw err;
		}

		redirect(303, '/expenses');
	},

	delete: async ({ params }) => {
		const db = getDb();
		await loadExpenseOr404(db, params.id);
		await softDeleteExpense(db, params.id);
		redirect(303, '/expenses');
	}
};
