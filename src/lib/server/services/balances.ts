import { computeBalances, settleUp } from '$lib/ledger';
import type { MemberBalance, Transfer } from '$lib/types';
import type { DB } from '../db';
import { listMembers } from './members';
import { listExpenses } from './expenses';
import { listPayments } from './payments';

export interface HouseholdBalances {
	balances: MemberBalance[];
	transfers: Transfer[];
}

/**
 * Loads all posted, non-deleted expenses (with shares) and non-deleted payments, and returns
 * computeBalances() over all members (active and inactive) plus settleUp() transfers.
 */
export function getHouseholdBalances(db: DB): HouseholdBalances {
	const members = listMembers(db, { includeInactive: true });
	const expenses = listExpenses(db, { status: 'posted' });
	const payments = listPayments(db);

	const memberIds = members.map((m) => m.id);
	const ledgerExpenses = expenses.map((e) => ({
		payerId: e.payerId,
		amountCents: e.amountCents,
		shares: e.shares.map((s) => ({ memberId: s.memberId, amountCents: s.amountCents }))
	}));
	const ledgerPayments = payments.map((p) => ({
		fromId: p.fromId,
		toId: p.toId,
		amountCents: p.amountCents
	}));

	const balances = computeBalances(memberIds, ledgerExpenses, ledgerPayments);
	const transfers = settleUp(balances);
	return { balances, transfers };
}
