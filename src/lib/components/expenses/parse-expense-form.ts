// Server-only helper (imports $lib/server/*). Only import this from +page.server.ts files —
// SvelteKit will fail the build if it's ever pulled into client code.
import { z } from 'zod';
import { parseMoney } from '$lib/money';
import { parseSplitFields } from '$lib/server/forms';
import type { ShareInput, SplitMode } from '$lib/types';

export const expenseFieldsSchema = z.object({
	description: z
		.string()
		.trim()
		.min(1, 'Description is required')
		.max(120, 'Description is too long'),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
	payerId: z.string().min(1, 'Choose who paid'),
	category: z.string().max(60, 'Category is too long').optional(),
	notes: z.string().max(2000, 'Notes are too long').optional()
});

/** Raw (unvalidated) string form values, kept for re-rendering the form on a failed submit. */
export interface ParsedExpenseValues {
	description: string;
	amount: string;
	isRefund: boolean;
	date: string;
	payerId: string;
	category: string;
	notes: string;
	splitMode: string;
	participants: string;
}

export interface ParsedExpenseData {
	description: string;
	amountCents: number;
	date: string;
	payerId: string;
	category: string | null;
	notes: string | null;
	splitMode: SplitMode;
	participants: ShareInput[];
}

export type ParsedExpenseForm =
	| {
			ok: true;
			errors: Record<string, string>;
			values: ParsedExpenseValues;
			data: ParsedExpenseData;
	  }
	| { ok: false; errors: Record<string, string>; values: ParsedExpenseValues };

/**
 * Parses + validates the expense form fields (description/amount/date/payerId/category/notes) plus
 * the SplitEditor's splitMode/participants hidden fields. `validMemberIds` gates both payerId and
 * split participants (pass every member, active or not — an edit may reference an inactive member).
 */
export function parseExpenseForm(form: FormData, validMemberIds: Set<string>): ParsedExpenseForm {
	const values: ParsedExpenseValues = {
		description: String(form.get('description') ?? ''),
		amount: String(form.get('amount') ?? ''),
		isRefund: form.get('isRefund') === 'on',
		date: String(form.get('date') ?? ''),
		payerId: String(form.get('payerId') ?? ''),
		category: String(form.get('category') ?? ''),
		notes: String(form.get('notes') ?? ''),
		splitMode: String(form.get('splitMode') ?? 'equal'),
		participants: String(form.get('participants') ?? '[]')
	};

	const errors: Record<string, string> = {};

	const parsed = expenseFieldsSchema.safeParse(values);
	if (!parsed.success) {
		for (const issue of parsed.error.issues) {
			const key = String(issue.path[0]);
			errors[key] ??= issue.message;
		}
	} else if (!validMemberIds.has(parsed.data.payerId)) {
		errors.payerId = 'Unknown payer';
	}

	const magnitude = parseMoney(values.amount);
	let amountCents: number | null = null;
	if (magnitude === null || magnitude === 0) {
		errors.amount ??= 'Enter a valid, non-zero amount';
	} else {
		amountCents = values.isRefund ? -Math.abs(magnitude) : Math.abs(magnitude);
	}

	const split = parseSplitFields(form, validMemberIds);
	if (!split.ok) errors.participants = split.error;

	if (Object.keys(errors).length === 0 && parsed.success && amountCents !== null && split.ok) {
		return {
			ok: true,
			errors,
			values,
			data: {
				description: parsed.data.description,
				amountCents,
				date: parsed.data.date,
				payerId: parsed.data.payerId,
				category: parsed.data.category?.trim() || null,
				notes: parsed.data.notes?.trim() || null,
				splitMode: split.splitMode,
				participants: split.participants
			}
		};
	}

	return { ok: false, errors, values };
}
