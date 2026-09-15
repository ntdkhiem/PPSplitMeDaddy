import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db';
import { createMember } from './members';
import { createExpense, listExpenses, updateExpense } from './expenses';

describe('expenses service', () => {
	it('creates and updates an expense with shares summing to the amount', () => {
		const db = createTestDb();
		const a = createMember(db, { name: 'Tyler' });
		const b = createMember(db, { name: 'Khiem' });
		const c = createMember(db, { name: 'Taro' });
		const input = {
			description: 'Wifi',
			amountCents: 6159,
			date: '2026-08-01',
			payerId: a.id,
			splitMode: 'equal' as const,
			participants: [{ memberId: a.id }, { memberId: b.id }, { memberId: c.id }]
		};
		const e = createExpense(db, input, a.id);
		expect(e.shares.map((s) => s.amountCents)).toEqual([2053, 2053, 2053]);
		const updated = updateExpense(db, e.id, { ...input, amountCents: 100 });
		expect(updated.shares.map((s) => s.amountCents)).toEqual([34, 33, 33]);
		expect(listExpenses(db, { memberId: c.id })).toHaveLength(1);
	});
});
