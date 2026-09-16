import { sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

// One household per deployment. Money is always integer cents. Dates are 'YYYY-MM-DD' text.
// Timestamps are unix epoch milliseconds.

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

/** A person who shares costs. May exist without a login (no email/password) until invited. */
export const members = sqliteTable('members', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	email: text('email').unique(),
	passwordHash: text('password_hash'),
	role: text('role', { enum: ['admin', 'member'] })
		.notNull()
		.default('member'),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdAt: createdAt()
});

export const sessions = sqliteTable(
	'sessions',
	{
		/** sha256(hex) of the random token stored in the cookie */
		id: text('id').primaryKey(),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('sessions_member_idx').on(t.memberId)]
);

/** One-time link letting an existing member set their email + password. */
export const invites = sqliteTable(
	'invites',
	{
		/** sha256(hex) of the token in the link */
		id: text('id').primaryKey(),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		usedAt: integer('used_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt()
	},
	(t) => [index('invites_member_idx').on(t.memberId)]
);

export const recurringTemplates = sqliteTable('recurring_templates', {
	id: text('id').primaryKey(),
	description: text('description').notNull(),
	category: text('category'),
	/** null = variable amount; generated expense is a draft needing an amount */
	amountCents: integer('amount_cents'),
	payerId: text('payer_id')
		.notNull()
		.references(() => members.id),
	splitMode: text('split_mode', { enum: ['equal', 'shares', 'exact'] })
		.notNull()
		.default('equal'),
	/** JSON ShareInput[] (see $lib/types) */
	participants: text('participants', { mode: 'json' })
		.notNull()
		.$type<{ memberId: string; weight?: number; amountCents?: number }[]>(),
	/** 1..28 */
	dayOfMonth: integer('day_of_month').notNull(),
	/** first period (YYYY-MM) to generate */
	startPeriod: text('start_period').notNull(),
	active: integer('active', { mode: 'boolean' }).notNull().default(true),
	createdBy: text('created_by').references(() => members.id),
	createdAt: createdAt()
});

export const expenses = sqliteTable(
	'expenses',
	{
		id: text('id').primaryKey(),
		description: text('description').notNull(),
		/** non-zero; negative = refund */
		amountCents: integer('amount_cents').notNull(),
		date: text('date').notNull(),
		category: text('category'),
		notes: text('notes'),
		payerId: text('payer_id')
			.notNull()
			.references(() => members.id),
		splitMode: text('split_mode', { enum: ['equal', 'shares', 'exact'] })
			.notNull()
			.default('equal'),
		/** drafts (e.g. recurring with unknown amount) are excluded from balances */
		status: text('status', { enum: ['posted', 'draft'] })
			.notNull()
			.default('posted'),
		recurringTemplateId: text('recurring_template_id').references(() => recurringTemplates.id),
		/** YYYY-MM for recurring-generated expenses */
		period: text('period'),
		createdBy: text('created_by').references(() => members.id),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' })
	},
	(t) => [
		index('expenses_date_idx').on(t.date),
		uniqueIndex('expenses_recurring_period_uq').on(t.recurringTemplateId, t.period)
	]
);

export const expenseShares = sqliteTable(
	'expense_shares',
	{
		expenseId: text('expense_id')
			.notNull()
			.references(() => expenses.id, { onDelete: 'cascade' }),
		memberId: text('member_id')
			.notNull()
			.references(() => members.id),
		/** only meaningful for split_mode 'shares' */
		weight: integer('weight'),
		/** computed share; shares of an expense sum to its amount_cents */
		amountCents: integer('amount_cents').notNull()
	},
	(t) => [primaryKey({ columns: [t.expenseId, t.memberId] })]
);

export const payments = sqliteTable(
	'payments',
	{
		id: text('id').primaryKey(),
		fromId: text('from_id')
			.notNull()
			.references(() => members.id),
		toId: text('to_id')
			.notNull()
			.references(() => members.id),
		/** positive */
		amountCents: integer('amount_cents').notNull(),
		date: text('date').notNull(),
		note: text('note'),
		createdBy: text('created_by').references(() => members.id),
		createdAt: createdAt(),
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' })
	},
	(t) => [index('payments_date_idx').on(t.date)]
);

export type Member = typeof members.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type RecurringTemplate = typeof recurringTemplates.$inferSelect;
