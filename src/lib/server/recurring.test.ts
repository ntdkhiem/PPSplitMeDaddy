import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './db';
import { expenses, expenseShares } from './db/schema';
import { createMember } from './services/members';
import { getExpense, listExpenses, softDeleteExpense } from './services/expenses';
import {
	createTemplate,
	deleteTemplate,
	generateDueExpenses,
	getTemplate,
	listTemplates,
	updateTemplate,
	type TemplateInput
} from './recurring';

function setup() {
	const db = createTestDb();
	const a = createMember(db, { name: 'Tyler' });
	const b = createMember(db, { name: 'Khiem' });
	const c = createMember(db, { name: 'Taro' });
	return { db, a, b, c };
}

function baseInput(overrides: Partial<TemplateInput> = {}, a: string, b: string): TemplateInput {
	return {
		description: 'Rent',
		amountCents: 200000,
		payerId: a,
		splitMode: 'equal',
		participants: [{ memberId: a }, { memberId: b }],
		dayOfMonth: 5,
		startPeriod: '2026-01',
		...overrides
	};
}

describe('recurring templates: validation', () => {
	it('rejects an empty description', () => {
		const { db, a, b } = setup();
		expect(() => createTemplate(db, baseInput({ description: '  ' }, a.id, b.id), null)).toThrow(
			/description/i
		);
	});

	it('rejects an out-of-range dayOfMonth', () => {
		const { db, a, b } = setup();
		expect(() => createTemplate(db, baseInput({ dayOfMonth: 0 }, a.id, b.id), null)).toThrow(
			/day of month/i
		);
		expect(() => createTemplate(db, baseInput({ dayOfMonth: 29 }, a.id, b.id), null)).toThrow(
			/day of month/i
		);
		expect(() => createTemplate(db, baseInput({ dayOfMonth: 1.5 }, a.id, b.id), null)).toThrow(
			/day of month/i
		);
	});

	it('rejects a malformed startPeriod', () => {
		const { db, a, b } = setup();
		expect(() =>
			createTemplate(db, baseInput({ startPeriod: '2026-13' }, a.id, b.id), null)
		).toThrow(/period/i);
		expect(() => createTemplate(db, baseInput({ startPeriod: '26-01' }, a.id, b.id), null)).toThrow(
			/period/i
		);
	});

	it('rejects no participants', () => {
		const { db, a, b } = setup();
		expect(() => createTemplate(db, baseInput({ participants: [] }, a.id, b.id), null)).toThrow(
			/participant/i
		);
	});

	it('rejects a zero amount (must be null or non-zero)', () => {
		const { db, a, b } = setup();
		expect(() => createTemplate(db, baseInput({ amountCents: 0 }, a.id, b.id), null)).toThrow(
			/amount/i
		);
	});

	it('rejects an invalid split when the amount is known', () => {
		const { db, a, b } = setup();
		expect(() =>
			createTemplate(
				db,
				baseInput(
					{ splitMode: 'exact', participants: [{ memberId: a.id, amountCents: 100 }] },
					a.id,
					b.id
				),
				null
			)
		).toThrow();
	});

	it('allows a null amount', () => {
		const { db, a, b } = setup();
		const tpl = createTemplate(db, baseInput({ amountCents: null }, a.id, b.id), null);
		expect(tpl.amountCents).toBeNull();
	});
});

describe('recurring templates: CRUD', () => {
	it('creates, lists, gets and updates a template', () => {
		const { db, a, b, c } = setup();
		const tpl = createTemplate(db, baseInput({}, a.id, b.id), a.id);
		expect(listTemplates(db)).toHaveLength(1);
		expect(getTemplate(db, tpl.id)?.id).toBe(tpl.id);

		const updated = updateTemplate(
			db,
			tpl.id,
			baseInput(
				{
					description: 'Rent (updated)',
					participants: [{ memberId: a.id }, { memberId: b.id }, { memberId: c.id }]
				},
				a.id,
				b.id
			)
		);
		expect(updated.description).toBe('Rent (updated)');
		expect(updated.participants).toHaveLength(3);
	});
});

describe('generateDueExpenses', () => {
	it('creates Jan + Feb by 2026-03-04, and Mar too by 2026-03-05', () => {
		const { db, a, b } = setup();
		createTemplate(db, baseInput({ dayOfMonth: 5, startPeriod: '2026-01' }, a.id, b.id), null);

		const created1 = generateDueExpenses(db, new Date(2026, 2, 4)); // March 4, 2026 (local)
		expect(created1).toBe(2);
		expect(listExpenses(db)).toHaveLength(2);
		const periods1 = listExpenses(db)
			.map((e) => e.period)
			.sort();
		expect(periods1).toEqual(['2026-01', '2026-02']);

		const created2 = generateDueExpenses(db, new Date(2026, 2, 5)); // March 5, 2026
		expect(created2).toBe(1);
		expect(listExpenses(db)).toHaveLength(3);
	});

	it('is idempotent: a second run at the same "now" creates nothing', () => {
		const { db, a, b } = setup();
		createTemplate(db, baseInput({ dayOfMonth: 5, startPeriod: '2026-01' }, a.id, b.id), null);
		const now = new Date(2026, 2, 10);
		expect(generateDueExpenses(db, now)).toBe(3);
		expect(generateDueExpenses(db, now)).toBe(0);
	});

	it('does not regenerate a soft-deleted generated expense', () => {
		const { db, a, b } = setup();
		createTemplate(db, baseInput({ dayOfMonth: 5, startPeriod: '2026-01' }, a.id, b.id), null);
		const now = new Date(2026, 0, 10); // Jan 10, 2026 -> only Jan due
		expect(generateDueExpenses(db, now)).toBe(1);
		const [created] = listExpenses(db);
		softDeleteExpense(db, created.id);
		expect(listExpenses(db)).toHaveLength(0);

		// run again for the same period: must not recreate it
		expect(generateDueExpenses(db, now)).toBe(0);
		const all = db.select().from(expenses).all();
		expect(all).toHaveLength(1);
	});

	it('skips inactive templates', () => {
		const { db, a, b } = setup();
		createTemplate(
			db,
			baseInput({ dayOfMonth: 5, startPeriod: '2026-01', active: false }, a.id, b.id),
			null
		);
		expect(generateDueExpenses(db, new Date(2026, 5, 1))).toBe(0);
		expect(listExpenses(db)).toHaveLength(0);
	});

	it('creates a draft with no shares when the amount is null', () => {
		const { db, a, b } = setup();
		createTemplate(
			db,
			baseInput({ amountCents: null, dayOfMonth: 5, startPeriod: '2026-01' }, a.id, b.id),
			null
		);
		expect(generateDueExpenses(db, new Date(2026, 0, 10))).toBe(1);
		const [created] = listExpenses(db);
		expect(created.status).toBe('draft');
		expect(created.amountCents).toBe(0);
		expect(created.shares).toHaveLength(0);

		const fetched = getExpense(db, created.id);
		expect(fetched?.shares).toHaveLength(0);
		const rawShares = db
			.select()
			.from(expenseShares)
			.where(eq(expenseShares.expenseId, created.id))
			.all();
		expect(rawShares).toHaveLength(0);
	});

	it('computes correct shares for split mode "shares"', () => {
		const { db, a, b, c } = setup();
		createTemplate(
			db,
			baseInput(
				{
					amountCents: 100,
					splitMode: 'shares',
					participants: [
						{ memberId: a.id, weight: 2 },
						{ memberId: b.id, weight: 1 },
						{ memberId: c.id, weight: 1 }
					],
					dayOfMonth: 5,
					startPeriod: '2026-01'
				},
				a.id,
				b.id
			),
			null
		);
		expect(generateDueExpenses(db, new Date(2026, 0, 10))).toBe(1);
		const [created] = listExpenses(db);
		const byMember = new Map(created.shares.map((s) => [s.memberId, s.amountCents]));
		expect(byMember.get(a.id)).toBe(50);
		expect(byMember.get(b.id)).toBe(25);
		expect(byMember.get(c.id)).toBe(25);
		expect(created.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(100);
	});
});

describe('deleteTemplate', () => {
	it('hard-deletes an unused template', () => {
		const { db, a, b } = setup();
		const tpl = createTemplate(db, baseInput({}, a.id, b.id), null);
		deleteTemplate(db, tpl.id);
		expect(getTemplate(db, tpl.id)).toBeUndefined();
	});

	it('deactivates (soft) a template with generated expenses instead of deleting it', () => {
		const { db, a, b } = setup();
		const tpl = createTemplate(
			db,
			baseInput({ dayOfMonth: 5, startPeriod: '2026-01' }, a.id, b.id),
			null
		);
		generateDueExpenses(db, new Date(2026, 0, 10));
		deleteTemplate(db, tpl.id);
		const after = getTemplate(db, tpl.id);
		expect(after).toBeDefined();
		expect(after?.active).toBe(false);
	});
});
