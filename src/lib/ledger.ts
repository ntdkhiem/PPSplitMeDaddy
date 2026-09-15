import type {
	ComputedShare,
	LedgerExpense,
	LedgerPayment,
	MemberBalance,
	ShareInput,
	SplitMode,
	Transfer
} from './types';

export class SplitError extends Error {}

/**
 * Split `amountCents` (non-zero, may be negative for refunds) across participants.
 * - equal: floor split; leftover cents go one each to participants in the given order.
 * - shares: proportional to positive integer weights; largest-remainder method, ties by given order.
 * - exact: each participant's amountCents must be provided and sum to the total.
 * The returned shares always sum exactly to amountCents and keep the input order.
 * Throws SplitError on invalid input (no participants, duplicate members, bad weights, sum mismatch).
 */
export function splitAmount(
	amountCents: number,
	mode: SplitMode,
	participants: ShareInput[]
): ComputedShare[] {
	if (!Number.isInteger(amountCents) || amountCents === 0)
		throw new SplitError('Amount must be a non-zero number of cents');
	if (participants.length === 0) throw new SplitError('Pick at least one participant');
	if (new Set(participants.map((p) => p.memberId)).size !== participants.length)
		throw new SplitError('A participant is listed twice');

	const sign = Math.sign(amountCents);
	const total = Math.abs(amountCents);

	if (mode === 'exact') {
		const amounts = participants.map((p) => p.amountCents);
		if (amounts.some((a) => a === undefined || !Number.isInteger(a)))
			throw new SplitError('Every participant needs an exact amount');
		const sum = (amounts as number[]).reduce((a, b) => a + b, 0);
		if (sum !== amountCents)
			throw new SplitError(`Exact amounts add up to ${sum} cents, expected ${amountCents}`);
		return participants.map((p) => ({
			memberId: p.memberId,
			weight: null,
			amountCents: p.amountCents!
		}));
	}

	const weights =
		mode === 'equal' ? participants.map(() => 1) : participants.map((p) => p.weight ?? NaN);
	if (weights.some((w) => !Number.isInteger(w) || w <= 0))
		throw new SplitError('Share weights must be positive whole numbers');
	const weightSum = weights.reduce((a, b) => a + b, 0);

	const base = weights.map((w) => Math.floor((total * w) / weightSum));
	let leftover = total - base.reduce((a, b) => a + b, 0);
	// largest remainder first; stable by input order
	const order = weights
		.map((w, i) => ({ i, rem: (total * w) % weightSum }))
		.sort((a, b) => b.rem - a.rem || a.i - b.i);
	for (const { i } of order) {
		if (leftover === 0) break;
		base[i]++;
		leftover--;
	}

	return participants.map((p, i) => ({
		memberId: p.memberId,
		weight: mode === 'shares' ? weights[i] : null,
		amountCents: sign * base[i]
	}));
}

/**
 * Net balance per member: paid − owed shares + payments sent − payments received.
 * Positive = owed money. Every member in `memberIds` appears (0 if no activity), in that order;
 * members referenced by entries but missing from `memberIds` are appended.
 * Result always sums to 0.
 */
export function computeBalances(
	memberIds: string[],
	expenses: LedgerExpense[],
	payments: LedgerPayment[]
): MemberBalance[] {
	const balances = new Map<string, number>();
	const order: string[] = [];
	const touch = (id: string, delta: number) => {
		if (!balances.has(id)) {
			balances.set(id, 0);
			order.push(id);
		}
		balances.set(id, balances.get(id)! + delta);
	};

	for (const id of memberIds) touch(id, 0);

	for (const e of expenses) {
		touch(e.payerId, e.amountCents);
		for (const s of e.shares) touch(s.memberId, -s.amountCents);
	}
	for (const p of payments) {
		touch(p.fromId, p.amountCents);
		touch(p.toId, -p.amountCents);
	}

	return order.map((memberId) => ({ memberId, balanceCents: balances.get(memberId)! }));
}

/**
 * Suggested transfers that bring every balance to 0, at most n−1 transfers.
 * Greedy: repeatedly the largest debtor pays the largest creditor min(|debt|, credit).
 * Deterministic tie-break by memberId. Ignores zero balances. Throws if balances do not sum to 0.
 */
export function settleUp(balances: MemberBalance[]): Transfer[] {
	const sum = balances.reduce((a, b) => a + b.balanceCents, 0);
	if (sum !== 0) throw new Error('Balances must sum to zero');

	interface Entry {
		memberId: string;
		amount: number;
	}
	const debtors: Entry[] = balances
		.filter((b) => b.balanceCents < 0)
		.map((b) => ({ memberId: b.memberId, amount: -b.balanceCents }));
	const creditors: Entry[] = balances
		.filter((b) => b.balanceCents > 0)
		.map((b) => ({ memberId: b.memberId, amount: b.balanceCents }));

	// largest amount first; ties broken by memberId ascending
	const byLargest = (a: Entry, b: Entry) =>
		b.amount - a.amount || a.memberId.localeCompare(b.memberId);

	const transfers: Transfer[] = [];
	while (debtors.length > 0 && creditors.length > 0) {
		debtors.sort(byLargest);
		creditors.sort(byLargest);
		const debtor = debtors[0];
		const creditor = creditors[0];
		const amountCents = Math.min(debtor.amount, creditor.amount);
		transfers.push({ fromId: debtor.memberId, toId: creditor.memberId, amountCents });
		debtor.amount -= amountCents;
		creditor.amount -= amountCents;
		if (debtor.amount === 0) debtors.shift();
		if (creditor.amount === 0) creditors.shift();
	}
	return transfers;
}
