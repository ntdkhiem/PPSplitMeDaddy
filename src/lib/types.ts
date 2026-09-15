export type SplitMode = 'equal' | 'shares' | 'exact';

/** One participant in a split. `weight` is used by 'shares', `amountCents` by 'exact'. */
export interface ShareInput {
	memberId: string;
	weight?: number;
	amountCents?: number;
}

export interface ComputedShare {
	memberId: string;
	weight: number | null;
	amountCents: number;
}

/** Positive = the member is owed money; negative = the member owes money. */
export interface MemberBalance {
	memberId: string;
	balanceCents: number;
}

export interface Transfer {
	fromId: string;
	toId: string;
	amountCents: number;
}

/** Minimal ledger inputs used by pure balance math. */
export interface LedgerExpense {
	payerId: string;
	amountCents: number;
	shares: { memberId: string; amountCents: number }[];
}

export interface LedgerPayment {
	fromId: string;
	toId: string;
	amountCents: number;
}
