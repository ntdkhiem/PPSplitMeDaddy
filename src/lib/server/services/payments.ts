import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { DB } from '../db';
import { payments, type Payment } from '../db/schema';

export interface PaymentInput {
	fromId: string;
	toId: string;
	amountCents: number;
	date: string;
	note?: string | null;
	/** e.g. 'Groceries' when the payment settles that category's expenses */
	category?: string | null;
}

export async function createPayment(
	db: DB,
	input: PaymentInput,
	createdBy: string | null
): Promise<Payment> {
	if (input.fromId === input.toId) throw new Error('Payer and recipient must differ');
	if (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
		throw new Error('Payment amount must be positive');
	return db
		.insert(payments)
		.values({
			id: crypto.randomUUID(),
			...input,
			note: input.note ?? null,
			category: input.category ?? null,
			createdBy
		})
		.returning()
		.get();
}

export async function softDeletePayment(db: DB, id: string): Promise<void> {
	await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id)).run();
}

export async function listPayments(
	db: DB,
	filter: {
		memberId?: string;
		/** exact category, case-insensitive */
		category?: string;
		limit?: number;
	} = {}
): Promise<Payment[]> {
	const conds = [isNull(payments.deletedAt)];
	if (filter.category) conds.push(sql`lower(${payments.category}) = lower(${filter.category})`);
	if (filter.memberId)
		conds.push(or(eq(payments.fromId, filter.memberId), eq(payments.toId, filter.memberId))!);
	const q = db
		.select()
		.from(payments)
		.where(and(...conds))
		.orderBy(desc(payments.date), desc(payments.createdAt));
	return filter.limit ? q.limit(filter.limit).all() : q.all();
}
