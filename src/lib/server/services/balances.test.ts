import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db';
import { createMember, updateMember } from './members';
import { createExpense, softDeleteExpense } from './expenses';
import { createPayment, softDeletePayment } from './payments';
import { getCategoryBalances, getHouseholdBalances } from './balances';

async function setup() {
	const db = await createTestDb();
	const tyler = await createMember(db, { name: 'Tyler' });
	const khiem = await createMember(db, { name: 'Khiem' });
	const taro = await createMember(db, { name: 'Taro' });
	return { db, tyler, khiem, taro };
}

describe('getHouseholdBalances', () => {
	it('includes posted expenses and payments, excluding drafts and soft-deleted entries', async () => {
		const { db, tyler, khiem, taro } = await setup();

		// Posted expense: Tyler pays 300, split equally -> Tyler +200, Khiem -100, Taro -100.
		await createExpense(
			db,
			{
				description: 'Groceries',
				amountCents: 300,
				date: '2026-08-01',
				payerId: tyler.id,
				splitMode: 'equal',
				participants: [{ memberId: tyler.id }, { memberId: khiem.id }, { memberId: taro.id }]
			},
			tyler.id
		);

		// Draft expense: excluded from balances entirely.
		await createExpense(
			db,
			{
				description: 'Rent (pending amount)',
				amountCents: 0,
				date: '2026-08-05',
				payerId: tyler.id,
				splitMode: 'equal',
				status: 'draft',
				participants: [{ memberId: tyler.id }, { memberId: khiem.id }, { memberId: taro.id }]
			},
			tyler.id
		);

		// Soft-deleted posted expense: excluded from balances.
		const deleted = await createExpense(
			db,
			{
				description: 'Cancelled dinner',
				amountCents: 9000,
				date: '2026-08-02',
				payerId: khiem.id,
				splitMode: 'equal',
				participants: [{ memberId: khiem.id }, { memberId: taro.id }]
			},
			khiem.id
		);
		await softDeleteExpense(db, deleted.id);

		// Payment: Khiem pays Tyler 50 -> Khiem +50 (less owed), Tyler -50 (less owed to).
		await createPayment(
			db,
			{ fromId: khiem.id, toId: tyler.id, amountCents: 50, date: '2026-08-03' },
			khiem.id
		);

		// Soft-deleted payment: excluded from balances.
		const deletedPayment = await createPayment(
			db,
			{ fromId: taro.id, toId: tyler.id, amountCents: 999, date: '2026-08-04' },
			taro.id
		);
		await softDeletePayment(db, deletedPayment.id);

		const { balances, transfers } = await getHouseholdBalances(db);

		// Ordered by member name: Khiem, Taro, Tyler.
		expect(balances).toEqual([
			{ memberId: khiem.id, balanceCents: -50 },
			{ memberId: taro.id, balanceCents: -100 },
			{ memberId: tyler.id, balanceCents: 150 }
		]);

		const sum = balances.reduce((a, b) => a + b.balanceCents, 0);
		expect(sum).toBe(0);

		expect(transfers.length).toBeGreaterThan(0);
		for (const t of transfers) expect(t.amountCents).toBeGreaterThan(0);

		// Recording the suggested transfers as payments should bring every balance to 0.
		for (const t of transfers) {
			await createPayment(
				db,
				{ fromId: t.fromId, toId: t.toId, amountCents: t.amountCents, date: '2026-08-06' },
				null
			);
		}
		const after = await getHouseholdBalances(db);
		for (const b of after.balances) expect(b.balanceCents).toBe(0);
		expect(after.transfers).toEqual([]);
	});

	it('includes inactive members with zero balances', async () => {
		const { db, tyler, khiem, taro } = await setup();
		const inactive = await createMember(db, { name: 'Inactive' });
		await updateMember(db, inactive.id, { active: false });

		await createExpense(
			db,
			{
				description: 'Coffee',
				amountCents: 300,
				date: '2026-08-01',
				payerId: tyler.id,
				splitMode: 'equal',
				participants: [{ memberId: tyler.id }, { memberId: khiem.id }, { memberId: taro.id }]
			},
			tyler.id
		);

		const { balances } = await getHouseholdBalances(db);
		const names = balances.map((b) => b.memberId);
		expect(names).toContain(inactive.id);
		expect(balances.find((b) => b.memberId === inactive.id)?.balanceCents).toBe(0);
	});
});

describe('getCategoryBalances', () => {
	it('counts only the category expenses and tagged payments', async () => {
		const { db, tyler, khiem, taro } = await setup();
		const everyone = [{ memberId: tyler.id }, { memberId: khiem.id }, { memberId: taro.id }];
		const base = { date: '2026-10-01', splitMode: 'equal' as const, participants: everyone };

		// Groceries: Tyler pays 300 -> Tyler +200, Khiem -100, Taro -100.
		await createExpense(
			db,
			{
				...base,
				description: 'Costco',
				amountCents: 300,
				payerId: tyler.id,
				category: 'Groceries'
			},
			tyler.id
		);
		// Not groceries: ignored.
		await createExpense(
			db,
			{ ...base, description: 'Wifi', amountCents: 900, payerId: khiem.id, category: 'Utilities' },
			khiem.id
		);
		// Grocery payment (any case) counts; untagged payment does not.
		await createPayment(
			db,
			{
				fromId: khiem.id,
				toId: tyler.id,
				amountCents: 100,
				date: '2026-10-02',
				category: 'groceries'
			},
			khiem.id
		);
		await createPayment(
			db,
			{ fromId: taro.id, toId: tyler.id, amountCents: 50, date: '2026-10-02' },
			taro.id
		);

		const { balances, transfers } = await getCategoryBalances(db, 'Groceries');
		const byId = new Map(balances.map((b) => [b.memberId, b.balanceCents]));
		expect(byId.get(tyler.id)).toBe(100);
		expect(byId.get(khiem.id)).toBe(0);
		expect(byId.get(taro.id)).toBe(-100);
		expect(transfers).toEqual([{ fromId: taro.id, toId: tyler.id, amountCents: 100 }]);

		// The overall ledger still counts every payment, tagged or not.
		const overall = await getHouseholdBalances(db);
		expect(overall.balances.reduce((a, b) => a + b.balanceCents, 0)).toBe(0);
	});
});
