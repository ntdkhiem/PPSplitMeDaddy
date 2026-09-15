import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { getDb } from '$lib/server/db';
import { listMembers } from '$lib/server/services/members';
import {
	commitImport,
	parseWorkbook,
	type ParsedWorkbook,
	type PersonMapping
} from '$lib/server/import-xlsx';
import { today } from '$lib/money';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function requireAdmin(event: RequestEvent) {
	const me = event.locals.member;
	if (!me) error(401, 'Not logged in');
	if (me.role !== 'admin') error(403, 'Only admins can import spreadsheets');
	return me;
}

const parsedRowSchema = z.object({
	row: z.number().int(),
	description: z.string(),
	amountCents: z.number().int(),
	participantNames: z.array(z.string())
});

const parsedSheetSchema = z.object({
	sheetName: z.string(),
	payerName: z.string(),
	rows: z.array(parsedRowSchema),
	skipped: z.array(z.string())
});

const parsedWorkbookSchema = z.object({
	sheets: z.array(parsedSheetSchema),
	people: z.array(z.string())
});

export const load: PageServerLoad = (event) => {
	requireAdmin(event);
	return {
		members: listMembers(getDb())
	};
};

export const actions: Actions = {
	upload: async (event) => {
		requireAdmin(event);
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Choose an .xlsx file to upload' });
		}
		if (!/\.xlsx$/i.test(file.name)) {
			return fail(400, { error: 'Only .xlsx files are supported' });
		}
		if (file.size > MAX_FILE_BYTES) {
			return fail(400, { error: 'File is too large (max 5 MB)' });
		}

		let parsed: ParsedWorkbook;
		try {
			const buffer = await file.arrayBuffer();
			parsed = await parseWorkbook(buffer);
		} catch (err) {
			return fail(400, {
				error:
					err instanceof Error
						? `Could not read that file: ${err.message}`
						: 'Could not read that file'
			});
		}

		if (parsed.sheets.length === 0) {
			return fail(400, { error: 'No "* Bills" sheets found in that workbook' });
		}

		return { parsed, importDate: today() };
	},

	commit: async (event) => {
		requireAdmin(event);
		const me = event.locals.member;
		const db = getDb();
		const form = await event.request.formData();

		const rawWorkbook = form.get('workbook');
		if (typeof rawWorkbook !== 'string') {
			return fail(400, { error: 'Missing parsed workbook; upload the file again' });
		}
		let json: unknown;
		try {
			json = JSON.parse(rawWorkbook);
		} catch {
			return fail(400, { error: 'Could not read the uploaded data; upload the file again' });
		}
		const parsedResult = parsedWorkbookSchema.safeParse(json);
		if (!parsedResult.success) {
			return fail(400, { error: 'Could not read the uploaded data; upload the file again' });
		}
		const parsed = parsedResult.data;

		const dateResult = z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid import date')
			.safeParse(form.get('date'));
		if (!dateResult.success) {
			return fail(400, { error: dateResult.error.issues[0].message, parsed, importDate: today() });
		}

		const memberIds = new Set(listMembers(db).map((m) => m.id));
		const mapping: PersonMapping = {};
		for (let i = 0; i < parsed.people.length; i++) {
			const name = parsed.people[i];
			const raw = form.get(`mapping-${i}`);
			if (typeof raw !== 'string' || raw === '') {
				mapping[name] = null;
				continue;
			}
			if (!memberIds.has(raw)) {
				return fail(400, {
					error: `Unknown member selected for "${name}"`,
					parsed,
					importDate: dateResult.data
				});
			}
			mapping[name] = raw;
		}

		const skipExisting = form.get('skipExisting') === 'on';

		const result = commitImport(db, parsed, mapping, {
			date: dateResult.data,
			createdBy: me?.id ?? null,
			skipExisting
		});

		return { result };
	}
};
