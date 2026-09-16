import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import {
	deleteTemplate,
	generateDueExpenses,
	getTemplate,
	updateTemplate
} from '$lib/server/recurring';
import { optionalText, parseSplitFields } from '$lib/server/forms';
import { parseMoney } from '$lib/money';

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

async function loadTemplateOr404(id: string) {
	const template = await getTemplate(getDb(), id);
	if (!template) error(404, 'Recurring template not found');
	return template;
}

export const load: PageServerLoad = async ({ params }) => {
	const [template, members] = await Promise.all([
		loadTemplateOr404(params.id),
		listMembers(getDb(), { includeInactive: true })
	]);
	return { template, members };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const db = getDb();
		const template = await loadTemplateOr404(params.id);
		const form = await request.formData();
		const raw = Object.fromEntries(form);
		const values = {
			description: String(raw.description ?? ''),
			category: String(raw.category ?? ''),
			amount: String(raw.amount ?? ''),
			payerId: String(raw.payerId ?? ''),
			dayOfMonth: String(raw.dayOfMonth ?? ''),
			startPeriod: String(raw.startPeriod ?? ''),
			active: raw.active === 'on'
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
			await updateTemplate(db, template.id, {
				description: parsed.data.description,
				category: optionalText(form, 'category'),
				amountCents,
				payerId: parsed.data.payerId,
				splitMode: split.splitMode,
				participants: split.participants,
				dayOfMonth: parsed.data.dayOfMonth,
				startPeriod: parsed.data.startPeriod,
				active: values.active
			});
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not update template',
				values
			});
		}

		const created = await generateDueExpenses(db);
		redirect(303, `/recurring?created=${created}`);
	},

	delete: async ({ params }) => {
		const db = getDb();
		const template = await loadTemplateOr404(params.id);
		await deleteTemplate(db, template.id);
		const stillExists = await getTemplate(db, template.id);
		redirect(303, `/recurring?${stillExists ? 'deactivated' : 'deleted'}=1`);
	}
};
