/**
 * Scales a signed balance to a 0-100 bar width percentage, relative to the largest absolute
 * balance in the set (`maxAbsCents`). Returns 0 when there is nothing to scale against.
 */
export function barWidthPct(balanceCents: number, maxAbsCents: number): number {
	if (maxAbsCents <= 0) return 0;
	const pct = (Math.abs(balanceCents) / maxAbsCents) * 100;
	return Math.min(100, Math.max(0, pct));
}

/** Largest absolute balance across a set of members, or 0 if empty/all zero. */
export function maxAbsBalance(balancesCents: number[]): number {
	return balancesCents.reduce((max, c) => Math.max(max, Math.abs(c)), 0);
}
