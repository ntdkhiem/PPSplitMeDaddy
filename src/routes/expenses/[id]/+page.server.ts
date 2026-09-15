import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb, type DB } from '$lib/server/db';
import { getMember, listMembers, toView } from '$lib/server/services/members';
import {
	getExpense,
	listExpenses,
	setReceiptPath,
	softDeleteExpense,
	updateExpense,
	type ExpenseWithShares
} from '$lib/server/services/expenses';
import { deleteReceipt, saveReceipt, ReceiptError } from '$lib/server/receipts';
import { SplitError } from '$lib/ledger';
import { distinctCategories } from '$lib/components/expenses/categories';
import { parseExpenseForm } from '$lib/components/expenses/parse-expense-form';

function loadExpenseOr404(db: DB, id: string): ExpenseWithShares {
	const expense = getExpense(db, id);
	if (!expense) error(404, 'Expense not found');
	return expense;
}

/** Active members plus anyone inactive still referenced by this expense (payer or a share). */
function memberOptionsFor(db: DB, expense: ExpenseWithShares) {
	const active = listMembers(db);
	const seen = new Set(active.map((m) => m.id));
	const options = [...active];
	const extraIds = new Set([expense.payerId, ...expense.shares.map((s) => s.memberId)]);
	for (const id of extraIds) {
		if (seen.has(id)) continue;
		const m = getMember(db, id);
		if (m) {
			options.push({ ...toView(m), name: `${m.name} (inactive)` });
			seen.add(id);
		}
	}
	return options;
}

export const load: PageServerLoad = ({ params }) => {
	const db = getDb();
	const expense = loadExpenseOr404(db, params.id);
	return {
		expense,
		members: memberOptionsFor(db, expense),
		categories: distinctCategories(listExpenses(db))
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const db = getDb();
		const existing = loadExpenseOr404(db, params.id);
		const form = await request.formData();
		const file = form.get('receipt');

		const validMemberIds = new Set(listMembers(db, { includeInactive: true }).map((m) => m.id));
		const parsedForm = parseExpenseForm(form, validMemberIds);
		if (!parsedForm.ok) {
			return fail(400, { errors: parsedForm.errors, values: parsedForm.values });
		}

		let newReceiptPath: string | undefined;
		if (file instanceof File && file.size > 0) {
			try {
				newReceiptPath = await saveReceipt(file);
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
			updateExpense(db, existing.id, {
				description: parsedForm.data.description,
				amountCents: parsedForm.data.amountCents,
				date: parsedForm.data.date,
				payerId: parsedForm.data.payerId,
				splitMode: parsedForm.data.splitMode,
				participants: parsedForm.data.participants,
				category: parsedForm.data.category,
				notes: parsedForm.data.notes,
				status: 'posted',
				receiptPath: newReceiptPath
			});
		} catch (err) {
			if (newReceiptPath) await deleteReceipt(newReceiptPath);
			if (err instanceof SplitError) {
				return fail(400, {
					errors: { participants: err.message },
					values: parsedForm.values
				});
			}
			throw err;
		}

		if (newReceiptPath && existing.receiptPath) {
			await deleteReceipt(existing.receiptPath);
		}

		redirect(303, '/expenses');
	},

	removeReceipt: async ({ params }) => {
		const db = getDb();
		const existing = loadExpenseOr404(db, params.id);
		if (existing.receiptPath) {
			setReceiptPath(db, existing.id, null);
			await deleteReceipt(existing.receiptPath);
		}
		return { removedReceipt: true };
	},

	delete: async ({ params }) => {
		const db = getDb();
		loadExpenseOr404(db, params.id);
		softDeleteExpense(db, params.id);
		redirect(303, '/expenses');
	}
};
