import { and, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { splitAmount } from '$lib/ledger';
import type { ShareInput, SplitMode } from '$lib/types';
import type { DB } from '../db';
import { expenseShares, expenses, type Expense, type ExpenseShare } from '../db/schema';

export interface ExpenseInput {
	description: string;
	amountCents: number;
	date: string;
	payerId: string;
	splitMode: SplitMode;
	participants: ShareInput[];
	category?: string | null;
	notes?: string | null;
	status?: 'posted' | 'draft';
	receiptPath?: string | null;
	recurringTemplateId?: string | null;
	period?: string | null;
}

export type ExpenseWithShares = Expense & { shares: ExpenseShare[] };

/**
 * Creates an expense and its computed shares in one transaction.
 * Drafts may have amountCents 0 and are stored with no shares (participants kept on the template).
 * Throws SplitError for invalid splits.
 */
export function createExpense(db: DB, input: ExpenseInput, createdBy: string | null): ExpenseWithShares {
	const isDraft = input.status === 'draft';
	const shares = isDraft && input.amountCents === 0 ? [] : splitAmount(input.amountCents, input.splitMode, input.participants);
	return db.transaction((tx) => {
		const expense = tx
			.insert(expenses)
			.values({
				id: crypto.randomUUID(),
				description: input.description.trim(),
				amountCents: input.amountCents,
				date: input.date,
				payerId: input.payerId,
				splitMode: input.splitMode,
				category: input.category ?? null,
				notes: input.notes ?? null,
				status: input.status ?? 'posted',
				receiptPath: input.receiptPath ?? null,
				recurringTemplateId: input.recurringTemplateId ?? null,
				period: input.period ?? null,
				createdBy
			})
			.returning()
			.get();
		const shareRows = shares.map((s) => ({ expenseId: expense.id, ...s }));
		if (shareRows.length) tx.insert(expenseShares).values(shareRows).run();
		return { ...expense, shares: shareRows };
	});
}

/** Replaces all editable fields and recomputes shares. Pass status 'posted' to finalize a draft. */
export function updateExpense(db: DB, id: string, input: ExpenseInput): ExpenseWithShares {
	const shares = splitAmount(input.amountCents, input.splitMode, input.participants);
	return db.transaction((tx) => {
		const expense = tx
			.update(expenses)
			.set({
				description: input.description.trim(),
				amountCents: input.amountCents,
				date: input.date,
				payerId: input.payerId,
				splitMode: input.splitMode,
				category: input.category ?? null,
				notes: input.notes ?? null,
				status: input.status ?? 'posted',
				...(input.receiptPath !== undefined ? { receiptPath: input.receiptPath } : {}),
				updatedAt: new Date()
			})
			.where(eq(expenses.id, id))
			.returning()
			.get();
		if (!expense) throw new Error('Expense not found');
		tx.delete(expenseShares).where(eq(expenseShares.expenseId, id)).run();
		const shareRows = shares.map((s) => ({ expenseId: id, ...s }));
		tx.insert(expenseShares).values(shareRows).run();
		return { ...expense, shares: shareRows };
	});
}

export function setReceiptPath(db: DB, id: string, receiptPath: string | null): void {
	db.update(expenses).set({ receiptPath, updatedAt: new Date() }).where(eq(expenses.id, id)).run();
}

export function softDeleteExpense(db: DB, id: string): void {
	db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id)).run();
}

export function getExpense(db: DB, id: string): ExpenseWithShares | undefined {
	const expense = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
		.get();
	if (!expense) return undefined;
	const shares = db.select().from(expenseShares).where(eq(expenseShares.expenseId, id)).all();
	return { ...expense, shares };
}

export interface ExpenseFilter {
	/** matches payer or participant */
	memberId?: string;
	search?: string;
	status?: 'posted' | 'draft';
	from?: string;
	to?: string;
	limit?: number;
}

/** Non-deleted expenses, newest date first, each with shares. */
export function listExpenses(db: DB, filter: ExpenseFilter = {}): ExpenseWithShares[] {
	const conds = [isNull(expenses.deletedAt)];
	if (filter.status) conds.push(eq(expenses.status, filter.status));
	if (filter.search) {
		const q = `%${filter.search}%`;
		conds.push(or(like(expenses.description, q), like(expenses.category, q))!);
	}
	let rows = db
		.select()
		.from(expenses)
		.where(and(...conds))
		.orderBy(desc(expenses.date), desc(expenses.createdAt))
		.all();
	if (filter.from) rows = rows.filter((e) => e.date >= filter.from!);
	if (filter.to) rows = rows.filter((e) => e.date <= filter.to!);

	const ids = rows.map((e) => e.id);
	const allShares = ids.length
		? db.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids)).all()
		: [];
	const byExpense = new Map<string, ExpenseShare[]>();
	for (const s of allShares) {
		const list = byExpense.get(s.expenseId) ?? [];
		list.push(s);
		byExpense.set(s.expenseId, list);
	}
	let result = rows.map((e) => ({ ...e, shares: byExpense.get(e.id) ?? [] }));
	if (filter.memberId) {
		const m = filter.memberId;
		result = result.filter((e) => e.payerId === m || e.shares.some((s) => s.memberId === m));
	}
	return filter.limit ? result.slice(0, filter.limit) : result;
}
