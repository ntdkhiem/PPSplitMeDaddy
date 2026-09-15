import { and, eq } from 'drizzle-orm';
import cron from 'node-cron';
import { splitAmount } from '$lib/ledger';
import type { ShareInput, SplitMode } from '$lib/types';
import type { DB } from './db';
import { expenses, recurringTemplates, type RecurringTemplate } from './db/schema';
import { createExpense } from './services/expenses';

// TODO(wave1-D): implement. Keep these signatures.

export interface TemplateInput {
	description: string;
	category?: string | null;
	/** null = variable amount -> generated expenses are drafts */
	amountCents: number | null;
	payerId: string;
	splitMode: SplitMode;
	participants: ShareInput[];
	/** 1..28 */
	dayOfMonth: number;
	/** YYYY-MM */
	startPeriod: string;
	active?: boolean;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateInput(input: TemplateInput): void {
	if (!input.description.trim()) throw new Error('Description is required');
	if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28)
		throw new Error('Day of month must be an integer from 1 to 28');
	if (!PERIOD_RE.test(input.startPeriod)) throw new Error('Start period must be in YYYY-MM format');
	if (!input.participants || input.participants.length === 0)
		throw new Error('Pick at least one participant');
	if (input.amountCents !== null) {
		if (!Number.isInteger(input.amountCents) || input.amountCents === 0)
			throw new Error('Amount must be null or a non-zero number of cents');
		// Throws SplitError (an Error) with a clear message when the split is invalid.
		splitAmount(input.amountCents, input.splitMode, input.participants);
	}
}

export function listTemplates(db: DB): RecurringTemplate[] {
	return db.select().from(recurringTemplates).all();
}

export function getTemplate(db: DB, id: string): RecurringTemplate | undefined {
	return db.select().from(recurringTemplates).where(eq(recurringTemplates.id, id)).get();
}

/** Validates (dayOfMonth range, period format, split valid when amount known) and inserts. */
export function createTemplate(
	db: DB,
	input: TemplateInput,
	createdBy: string | null
): RecurringTemplate {
	validateInput(input);
	return db
		.insert(recurringTemplates)
		.values({
			id: crypto.randomUUID(),
			description: input.description.trim(),
			category: input.category ?? null,
			amountCents: input.amountCents,
			payerId: input.payerId,
			splitMode: input.splitMode,
			participants: input.participants,
			dayOfMonth: input.dayOfMonth,
			startPeriod: input.startPeriod,
			active: input.active ?? true,
			createdBy
		})
		.returning()
		.get();
}

export function updateTemplate(db: DB, id: string, input: TemplateInput): RecurringTemplate {
	validateInput(input);
	const row = db
		.update(recurringTemplates)
		.set({
			description: input.description.trim(),
			category: input.category ?? null,
			amountCents: input.amountCents,
			payerId: input.payerId,
			splitMode: input.splitMode,
			participants: input.participants,
			dayOfMonth: input.dayOfMonth,
			startPeriod: input.startPeriod,
			active: input.active ?? true
		})
		.where(eq(recurringTemplates.id, id))
		.returning()
		.get();
	if (!row) throw new Error('Recurring template not found');
	return row;
}

/** Hard-deletes a template only if no expenses reference it; otherwise deactivates it. */
export function deleteTemplate(db: DB, id: string): void {
	const referencing = db
		.select({ id: expenses.id })
		.from(expenses)
		.where(eq(expenses.recurringTemplateId, id))
		.limit(1)
		.get();
	if (referencing) {
		db.update(recurringTemplates).set({ active: false }).where(eq(recurringTemplates.id, id)).run();
	} else {
		db.delete(recurringTemplates).where(eq(recurringTemplates.id, id)).run();
	}
}

function localDateStr(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Inclusive list of YYYY-MM periods from `start` through `end`. */
function periodsBetween(start: string, end: string): string[] {
	const [sy, sm] = start.split('-').map(Number);
	const [ey, em] = end.split('-').map(Number);
	const periods: string[] = [];
	let y = sy;
	let m = sm;
	while (y < ey || (y === ey && m <= em)) {
		periods.push(`${y}-${String(m).padStart(2, '0')}`);
		m++;
		if (m > 12) {
			m = 1;
			y++;
		}
	}
	return periods;
}

function isUniqueConstraintError(err: unknown): boolean {
	return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/**
 * For every active template, creates the expense for each period from startPeriod up to and
 * including the current period of `now` whose due date (period + dayOfMonth) is <= now's local date,
 * skipping periods that already have an expense for that template (including soft-deleted ones).
 * Expense date = due date; period = YYYY-MM. Known amount -> posted with computed split;
 * null amount -> draft with amountCents 0 (to be filled in by a user).
 * Idempotent: calling twice creates nothing new. Returns number of expenses created.
 */
export function generateDueExpenses(db: DB, now: Date = new Date()): number {
	const today = localDateStr(now);
	const currentPeriod = today.slice(0, 7);
	const templates = db
		.select()
		.from(recurringTemplates)
		.where(eq(recurringTemplates.active, true))
		.all();

	return db.transaction((tx) => {
		let count = 0;
		for (const tpl of templates) {
			if (tpl.startPeriod > currentPeriod) continue;
			const periods = periodsBetween(tpl.startPeriod, currentPeriod);
			const dd = String(tpl.dayOfMonth).padStart(2, '0');
			for (const period of periods) {
				const dueDate = `${period}-${dd}`;
				if (dueDate > today) continue;

				const existing = tx
					.select({ id: expenses.id })
					.from(expenses)
					.where(and(eq(expenses.recurringTemplateId, tpl.id), eq(expenses.period, period)))
					.get();
				if (existing) continue;

				const isKnown = tpl.amountCents !== null;
				try {
					createExpense(
						tx as unknown as DB,
						{
							description: tpl.description,
							amountCents: isKnown ? tpl.amountCents! : 0,
							date: dueDate,
							payerId: tpl.payerId,
							splitMode: tpl.splitMode,
							participants: tpl.participants,
							category: tpl.category,
							status: isKnown ? 'posted' : 'draft',
							recurringTemplateId: tpl.id,
							period
						},
						null
					);
					count++;
				} catch (err) {
					if (isUniqueConstraintError(err)) continue;
					throw err;
				}
			}
		}
		return count;
	});
}

/** Runs generateDueExpenses on startup and daily at 06:00 via node-cron. Safe to call more than once. */
export function startRecurringScheduler(db: DB): void {
	const g = globalThis as typeof globalThis & { __ppSplitMeDaddyRecurringStarted?: boolean };
	if (g.__ppSplitMeDaddyRecurringStarted) return;
	g.__ppSplitMeDaddyRecurringStarted = true;

	const run = () => {
		try {
			generateDueExpenses(db);
		} catch (err) {
			console.error('recurring: failed to generate due expenses', err);
		}
	};

	try {
		run();
		cron.schedule('0 6 * * *', run);
	} catch (err) {
		console.error('recurring: failed to start scheduler', err);
	}
}
