import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import { createExpense, listExpenses } from '$lib/server/services/expenses';
import { SplitError } from '$lib/ledger';
import { GROCERY_CATEGORY, categoryOptions } from '$lib/components/expenses/categories';
import { parseExpenseForm } from '$lib/components/expenses/parse-expense-form';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const [members, expenses] = await Promise.all([listMembers(db), listExpenses(db)]);
	return {
		members,
		categories: categoryOptions(expenses),
		/** prefilled category, e.g. from the groceries page's "Add grocery" link */
		category: url.searchParams.get('category')?.trim().slice(0, 60) ?? ''
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const db = getDb();
		const form = await request.formData();

		const allMembers = await listMembers(db, { includeInactive: true });
		const validMemberIds = new Set(allMembers.map((m) => m.id));
		const parsedForm = parseExpenseForm(form, validMemberIds);
		if (!parsedForm.ok) {
			return fail(400, { errors: parsedForm.errors, values: parsedForm.values });
		}

		try {
			await createExpense(
				db,
				{
					description: parsedForm.data.description,
					amountCents: parsedForm.data.amountCents,
					date: parsedForm.data.date,
					payerId: parsedForm.data.payerId,
					splitMode: parsedForm.data.splitMode,
					participants: parsedForm.data.participants,
					category: parsedForm.data.category,
					notes: parsedForm.data.notes
				},
				locals.member!.id
			);
		} catch (err) {
			if (err instanceof SplitError) {
				return fail(400, {
					errors: { participants: err.message },
					values: parsedForm.values
				});
			}
			throw err;
		}

		const isGrocery = parsedForm.data.category?.toLowerCase() === GROCERY_CATEGORY.toLowerCase();
		redirect(303, isGrocery ? '/groceries' : '/expenses');
	}
};
