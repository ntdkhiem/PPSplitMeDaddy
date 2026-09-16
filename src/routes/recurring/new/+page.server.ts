import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import { createTemplate, generateDueExpenses } from '$lib/server/recurring';
import { optionalText, parseSplitFields } from '$lib/server/forms';
import { parseMoney, today } from '$lib/money';

const fieldsSchema = z.object({
	description: z.string().trim().min(1, 'Description is required').max(200, 'Too long'),
	payerId: z.string().min(1, 'Choose who paid'),
	dayOfMonth: z.coerce
		.number('Day of month is required')
		.int('Day of month must be a whole number')
		.min(1, 'Day of month must be between 1 and 28')
		.max(28, 'Day of month must be between 1 and 28'),
	startPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a start month')
});

export const load: PageServerLoad = async ({ locals }) => {
	const members = await listMembers(getDb(), { includeInactive: true });
	return {
		members,
		defaultPayerId: locals.member?.id ?? '',
		defaultParticipantIds: members.filter((m) => m.active).map((m) => m.id),
		defaultStartPeriod: today().slice(0, 7)
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const db = getDb();
		const form = await request.formData();
		const raw = Object.fromEntries(form);
		const values = {
			description: String(raw.description ?? ''),
			category: String(raw.category ?? ''),
			amount: String(raw.amount ?? ''),
			payerId: String(raw.payerId ?? ''),
			dayOfMonth: String(raw.dayOfMonth ?? ''),
			startPeriod: String(raw.startPeriod ?? today().slice(0, 7))
		};

		const parsed = fieldsSchema.safeParse(raw);
		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0].message, values });
		}

		const memberIds = new Set((await listMembers(db, { includeInactive: true })).map((m) => m.id));
		if (!memberIds.has(parsed.data.payerId)) {
			return fail(400, { error: 'Choose who paid', values });
		}

		let amountCents: number | null = null;
		const amountText = values.amount.trim();
		if (amountText !== '') {
			amountCents = parseMoney(amountText);
			if (amountCents === null || amountCents <= 0) {
				return fail(400, {
					error: 'Enter a valid amount, or leave it blank for a varying amount',
					values
				});
			}
		}

		const split = parseSplitFields(form, memberIds);
		if (!split.ok) {
			return fail(400, { error: split.error, values });
		}

		try {
			await createTemplate(
				db,
				{
					description: parsed.data.description,
					category: optionalText(form, 'category'),
					amountCents,
					payerId: parsed.data.payerId,
					splitMode: split.splitMode,
					participants: split.participants,
					dayOfMonth: parsed.data.dayOfMonth,
					startPeriod: parsed.data.startPeriod
				},
				locals.member?.id ?? null
			);
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not create template',
				values
			});
		}

		const created = await generateDueExpenses(db);
		redirect(303, `/recurring?created=${created}`);
	}
};
