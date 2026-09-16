import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMember, listMembers } from '$lib/server/services/members';
import { listExpenses } from '$lib/server/services/expenses';
import { createPayment, listPayments } from '$lib/server/services/payments';
import { getHouseholdBalances } from '$lib/server/services/balances';
import { formatMoney, today } from '$lib/money';
import {
	mergeActivity,
	type ActivityExpense,
	type ActivityPayment
} from '$lib/components/dashboard/activity';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const [members, { balances, transfers }, draftExpenses, recentExpenses, recentPayments] =
		await Promise.all([
			listMembers(db, { includeInactive: true }),
			getHouseholdBalances(db),
			listExpenses(db, { status: 'draft' }),
			listExpenses(db, { status: 'posted', limit: 10 }),
			listPayments(db, { limit: 10 })
		]);

	const activityExpenses: ActivityExpense[] = recentExpenses.map((e) => ({
		kind: 'expense',
		id: e.id,
		date: e.date,
		createdAt: e.createdAt.getTime(),
		payerId: e.payerId,
		amountCents: e.amountCents,
		description: e.description
	}));
	const activityPayments: ActivityPayment[] = recentPayments.map((p) => ({
		kind: 'payment',
		id: p.id,
		date: p.date,
		createdAt: p.createdAt.getTime(),
		fromId: p.fromId,
		toId: p.toId,
		amountCents: p.amountCents
	}));
	const activity = mergeActivity(activityExpenses, activityPayments, 10);

	const hasAnyActivity =
		recentExpenses.length > 0 || recentPayments.length > 0 || draftExpenses.length > 0;

	return {
		members,
		balances,
		transfers,
		draftExpenses: draftExpenses.map((e) => ({ id: e.id, description: e.description })),
		activity,
		hasAnyActivity,
		meId: locals.member?.id ?? null
	};
};

const recordSchema = z.object({
	fromId: z.string().min(1),
	toId: z.string().min(1),
	amountCents: z.coerce.number().int().positive()
});

export const actions: Actions = {
	record: async ({ request, locals }) => {
		const db = getDb();
		const form = await request.formData();
		const parsed = recordSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) {
			return fail(400, { error: 'Invalid payment' });
		}
		const { fromId, toId, amountCents } = parsed.data;
		if (fromId === toId) {
			return fail(400, { error: 'Payer and recipient must differ' });
		}
		const [from, to] = await Promise.all([getMember(db, fromId), getMember(db, toId)]);
		if (!from || !to) {
			return fail(400, { error: 'Unknown member' });
		}

		await createPayment(
			db,
			{ fromId, toId, amountCents, date: today() },
			locals.member?.id ?? null
		);
		return { success: `Recorded ${from.name} → ${to.name}: ${formatMoney(amountCents)}` };
	}
};
