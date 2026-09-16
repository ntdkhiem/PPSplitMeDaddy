import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { DB } from '../db';
import { payments, type Payment } from '../db/schema';

export interface PaymentInput {
	fromId: string;
	toId: string;
	amountCents: number;
	date: string;
	note?: string | null;
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
		.values({ id: crypto.randomUUID(), ...input, note: input.note ?? null, createdBy })
		.returning()
		.get();
}

export async function softDeletePayment(db: DB, id: string): Promise<void> {
	await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id)).run();
}

export async function listPayments(
	db: DB,
	filter: { memberId?: string; limit?: number } = {}
): Promise<Payment[]> {
	const conds = [isNull(payments.deletedAt)];
	if (filter.memberId)
		conds.push(or(eq(payments.fromId, filter.memberId), eq(payments.toId, filter.memberId))!);
	const q = db
		.select()
		.from(payments)
		.where(and(...conds))
		.orderBy(desc(payments.date), desc(payments.createdAt));
	return filter.limit ? q.limit(filter.limit).all() : q.all();
}
