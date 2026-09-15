import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import { createPayment, listPayments, softDeletePayment } from '$lib/server/services/payments';
import { centsToInput, parseMoney, today } from '$lib/money';
import { optionalText } from '$lib/server/forms';

const paymentSchema = z.object({
	fromId: z.string().min(1, 'Choose a payer'),
	toId: z.string().min(1, 'Choose a recipient'),
	amount: z.string().min(1, 'Enter an amount'),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date')
});

export const load: PageServerLoad = ({ locals, url }) => {
	const db = getDb();
	const members = listMembers(db, { includeInactive: true });
	const membersById = new Map(members.map((m) => [m.id, m]));

	const memberFilter = url.searchParams.get('member') ?? '';
	const payments = listPayments(db, { memberId: memberFilter || undefined }).map((p) => ({
		id: p.id,
		date: p.date,
		fromId: p.fromId,
		toId: p.toId,
		fromName: membersById.get(p.fromId)?.name ?? 'Unknown',
		toName: membersById.get(p.toId)?.name ?? 'Unknown',
		amountCents: p.amountCents,
		note: p.note,
		createdByName: p.createdBy ? (membersById.get(p.createdBy)?.name ?? 'Unknown') : null
	}));

	const amountParam = url.searchParams.get('amount');
	const amountCents = amountParam !== null ? Number(amountParam) : null;

	const prefill = {
		fromId: url.searchParams.get('from') ?? locals.member?.id ?? '',
		toId: url.searchParams.get('to') ?? '',
		amount: amountCents !== null && Number.isInteger(amountCents) ? centsToInput(amountCents) : '',
		date: today(),
		note: ''
	};

	return { members, payments, memberFilter, prefill };
};

export const actions: Actions = {
	record: async ({ request, locals }) => {
		const db = getDb();
		const form = await request.formData();
		const raw = Object.fromEntries(form);
		const values = {
			fromId: String(raw.fromId ?? ''),
			toId: String(raw.toId ?? ''),
			amount: String(raw.amount ?? ''),
			date: String(raw.date ?? today()),
			note: String(raw.note ?? '')
		};

		const parsed = paymentSchema.safeParse(raw);
		if (!parsed.success) {
			const errors: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const key = String(issue.path[0]);
				errors[key] ??= issue.message;
			}
			return fail(400, { errors, values });
		}

		const cents = parseMoney(parsed.data.amount);
		if (cents === null || cents <= 0) {
			const errors: Record<string, string> = { amount: 'Enter a valid positive amount' };
			return fail(400, { errors, values });
		}
		if (parsed.data.fromId === parsed.data.toId) {
			const errors: Record<string, string> = { toId: 'Payer and recipient must differ' };
			return fail(400, { errors, values });
		}
		const validIds = new Set(listMembers(db, { includeInactive: true }).map((m) => m.id));
		if (!validIds.has(parsed.data.fromId) || !validIds.has(parsed.data.toId)) {
			const errors: Record<string, string> = { toId: 'Unknown member' };
			return fail(400, { errors, values });
		}

		createPayment(
			db,
			{
				fromId: parsed.data.fromId,
				toId: parsed.data.toId,
				amountCents: cents,
				date: parsed.data.date,
				note: optionalText(form, 'note')
			},
			locals.member?.id ?? null
		);
		return { success: 'Payment recorded' };
	},

	delete: async ({ request }) => {
		const db = getDb();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing payment id' });
		softDeletePayment(db, id);
		return { success: 'Payment deleted' };
	}
};
