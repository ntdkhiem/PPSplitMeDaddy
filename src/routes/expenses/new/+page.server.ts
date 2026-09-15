import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import { createExpense, listExpenses } from '$lib/server/services/expenses';
import { deleteReceipt, saveReceipt, ReceiptError } from '$lib/server/receipts';
import { SplitError } from '$lib/ledger';
import { distinctCategories } from '$lib/components/expenses/categories';
import { parseExpenseForm } from '$lib/components/expenses/parse-expense-form';

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		members: listMembers(db),
		categories: distinctCategories(listExpenses(db))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const db = getDb();
		const form = await request.formData();
		const file = form.get('receipt');

		const validMemberIds = new Set(listMembers(db, { includeInactive: true }).map((m) => m.id));
		const parsedForm = parseExpenseForm(form, validMemberIds);
		if (!parsedForm.ok) {
			return fail(400, { errors: parsedForm.errors, values: parsedForm.values });
		}

		let receiptPath: string | undefined;
		if (file instanceof File && file.size > 0) {
			try {
				receiptPath = await saveReceipt(file);
			} catch (err) {
				if (err instanceof ReceiptError) {
					return fail(400, {
						errors: { receipt: err.message },
						values: parsedForm.values
					});
				}
				throw err;
			}
		}

		try {
			createExpense(
				db,
				{
					description: parsedForm.data.description,
					amountCents: parsedForm.data.amountCents,
					date: parsedForm.data.date,
					payerId: parsedForm.data.payerId,
					splitMode: parsedForm.data.splitMode,
					participants: parsedForm.data.participants,
					category: parsedForm.data.category,
					notes: parsedForm.data.notes,
					receiptPath
				},
				locals.member!.id
			);
		} catch (err) {
			if (receiptPath) await deleteReceipt(receiptPath);
			if (err instanceof SplitError) {
				return fail(400, {
					errors: { participants: err.message },
					values: parsedForm.values
				});
			}
			throw err;
		}

		redirect(303, '/expenses');
	}
};
