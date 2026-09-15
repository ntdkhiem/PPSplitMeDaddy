import { describe, expect, it } from 'vitest';
import { computeBalances, settleUp, SplitError, splitAmount } from './ledger';
import type { ShareInput } from './types';

describe('splitAmount', () => {
	describe('equal', () => {
		it('distributes remainder cents one each in input order', () => {
			const shares = splitAmount(100, 'equal', [
				{ memberId: 'a' },
				{ memberId: 'b' },
				{ memberId: 'c' }
			]);
			expect(shares.map((s) => s.amountCents)).toEqual([34, 33, 33]);
		});

		it('handles a 2-way split with a leftover cent', () => {
			const shares = splitAmount(1909, 'equal', [{ memberId: 'a' }, { memberId: 'b' }]);
			expect(shares.map((s) => s.amountCents)).toEqual([955, 954]);
		});

		it('keeps input order and null weight', () => {
			const shares = splitAmount(300, 'equal', [
				{ memberId: 'a' },
				{ memberId: 'b' },
				{ memberId: 'c' }
			]);
			expect(shares).toEqual([
				{ memberId: 'a', weight: null, amountCents: 100 },
				{ memberId: 'b', weight: null, amountCents: 100 },
				{ memberId: 'c', weight: null, amountCents: 100 }
			]);
		});
	});

	describe('shares', () => {
		it('splits proportionally to weights (2:1)', () => {
			const shares = splitAmount(100, 'shares', [
				{ memberId: 'a', weight: 2 },
				{ memberId: 'b', weight: 1 }
			]);
			expect(shares.map((s) => s.amountCents)).toEqual([67, 33]);
			expect(shares.map((s) => s.weight)).toEqual([2, 1]);
			expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(100);
		});

		it('rejects non-positive or non-integer weights', () => {
			expect(() =>
				splitAmount(100, 'shares', [
					{ memberId: 'a', weight: 0 },
					{ memberId: 'b', weight: 1 }
				])
			).toThrow(SplitError);
			expect(() =>
				splitAmount(100, 'shares', [
					{ memberId: 'a', weight: 1.5 },
					{ memberId: 'b', weight: 1 }
				])
			).toThrow(SplitError);
			expect(() =>
				splitAmount(100, 'shares', [{ memberId: 'a' }, { memberId: 'b', weight: 1 }])
			).toThrow(SplitError);
		});
	});

	describe('exact', () => {
		it('accepts amounts that sum to the total', () => {
			const shares = splitAmount(100, 'exact', [
				{ memberId: 'a', amountCents: 60 },
				{ memberId: 'b', amountCents: 40 }
			]);
			expect(shares).toEqual([
				{ memberId: 'a', weight: null, amountCents: 60 },
				{ memberId: 'b', weight: null, amountCents: 40 }
			]);
		});

		it('throws on a sum mismatch', () => {
			expect(() =>
				splitAmount(100, 'exact', [
					{ memberId: 'a', amountCents: 60 },
					{ memberId: 'b', amountCents: 30 }
				])
			).toThrow(SplitError);
		});

		it('throws when an amount is missing', () => {
			expect(() =>
				splitAmount(100, 'exact', [{ memberId: 'a', amountCents: 100 }, { memberId: 'b' }])
			).toThrow(SplitError);
		});
	});

	describe('negative amounts (refunds)', () => {
		it('splits a negative amount equally, keeping the sign', () => {
			const shares = splitAmount(-100, 'equal', [
				{ memberId: 'a' },
				{ memberId: 'b' },
				{ memberId: 'c' }
			]);
			expect(shares.map((s) => s.amountCents)).toEqual([-34, -33, -33]);
			expect(shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(-100);
		});

		it('splits a negative amount by shares, keeping the sign', () => {
			const shares = splitAmount(-100, 'shares', [
				{ memberId: 'a', weight: 2 },
				{ memberId: 'b', weight: 1 }
			]);
			expect(shares.map((s) => s.amountCents)).toEqual([-67, -33]);
		});

		it('splits a negative amount exactly', () => {
			const shares = splitAmount(-100, 'exact', [
				{ memberId: 'a', amountCents: -60 },
				{ memberId: 'b', amountCents: -40 }
			]);
			expect(shares.map((s) => s.amountCents)).toEqual([-60, -40]);
		});
	});

	describe('validation', () => {
		it('rejects a zero amount', () => {
			expect(() => splitAmount(0, 'equal', [{ memberId: 'a' }])).toThrow(SplitError);
		});

		it('rejects a non-integer amount', () => {
			expect(() => splitAmount(10.5, 'equal', [{ memberId: 'a' }])).toThrow(SplitError);
		});

		it('rejects no participants', () => {
			expect(() => splitAmount(100, 'equal', [])).toThrow(SplitError);
		});

		it('rejects a duplicate participant', () => {
			expect(() => splitAmount(100, 'equal', [{ memberId: 'a' }, { memberId: 'a' }])).toThrow(
				SplitError
			);
		});
	});

	describe('property: shares sum to amount and are within 1 cent of ideal', () => {
		function randInt(min: number, max: number) {
			return min + Math.floor(Math.random() * (max - min + 1));
		}

		it('holds for random equal and shares splits', () => {
			for (let trial = 0; trial < 200; trial++) {
				const n = randInt(1, 8);
				const amountCents = randInt(1, 100_000) * (Math.random() < 0.5 ? -1 : 1);
				const mode = Math.random() < 0.5 ? 'equal' : 'shares';
				const participants: ShareInput[] =
					mode === 'equal'
						? Array.from({ length: n }, (_, i) => ({ memberId: `m${i}` }))
						: Array.from({ length: n }, (_, i) => ({ memberId: `m${i}`, weight: randInt(1, 5) }));

				const shares = splitAmount(amountCents, mode as 'equal' | 'shares', participants);
				const sum = shares.reduce((a, s) => a + s.amountCents, 0);
				expect(sum).toBe(amountCents);

				const weightSum = participants.reduce(
					(a, p) => a + (mode === 'equal' ? 1 : (p.weight ?? 0)),
					0
				);
				for (let i = 0; i < n; i++) {
					const w = mode === 'equal' ? 1 : (participants[i].weight ?? 0);
					const ideal = (amountCents * w) / weightSum;
					expect(Math.abs(shares[i].amountCents - ideal)).toBeLessThanOrEqual(1);
				}
			}
		});
	});
});

describe('computeBalances', () => {
	it('sums to 0', () => {
		const balances = computeBalances(
			['a', 'b', 'c'],
			[
				{
					payerId: 'a',
					amountCents: 300,
					shares: [
						{ memberId: 'a', amountCents: 100 },
						{ memberId: 'b', amountCents: 100 },
						{ memberId: 'c', amountCents: 100 }
					]
				},
				{
					payerId: 'b',
					amountCents: 60,
					shares: [
						{ memberId: 'a', amountCents: 30 },
						{ memberId: 'b', amountCents: 30 }
					]
				}
			],
			[{ fromId: 'c', toId: 'b', amountCents: 20 }]
		);
		expect(balances.reduce((a, b) => a + b.balanceCents, 0)).toBe(0);
	});

	it('the payer need not be a participant', () => {
		const balances = computeBalances(
			['a', 'b', 'c'],
			[
				{
					payerId: 'a',
					amountCents: 90,
					shares: [
						{ memberId: 'b', amountCents: 45 },
						{ memberId: 'c', amountCents: 45 }
					]
				}
			],
			[]
		);
		expect(balances).toEqual([
			{ memberId: 'a', balanceCents: 90 },
			{ memberId: 'b', balanceCents: -45 },
			{ memberId: 'c', balanceCents: -45 }
		]);
	});

	it('accounts for payments sent and received', () => {
		const balances = computeBalances(
			['a', 'b'],
			[],
			[{ fromId: 'a', toId: 'b', amountCents: 500 }]
		);
		expect(balances).toEqual([
			{ memberId: 'a', balanceCents: 500 },
			{ memberId: 'b', balanceCents: -500 }
		]);
	});

	it('appends members referenced only by entries, in first-seen order', () => {
		const balances = computeBalances(
			['a'],
			[{ payerId: 'z', amountCents: 100, shares: [{ memberId: 'y', amountCents: 100 }] }],
			[{ fromId: 'y', toId: 'x', amountCents: 10 }]
		);
		expect(balances.map((b) => b.memberId)).toEqual(['a', 'z', 'y', 'x']);
	});
});

describe('settleUp', () => {
	it('settles 2 people with a single transfer', () => {
		const transfers = settleUp([
			{ memberId: 'a', balanceCents: 500 },
			{ memberId: 'b', balanceCents: -500 }
		]);
		expect(transfers).toEqual([{ fromId: 'b', toId: 'a', amountCents: 500 }]);
	});

	it('matches the documented 3-person example', () => {
		const transfers = settleUp([
			{ memberId: 'Tyler', balanceCents: 10000 },
			{ memberId: 'Khiem', balanceCents: -6000 },
			{ memberId: 'Taro', balanceCents: -4000 }
		]);
		expect(transfers).toEqual([
			{ fromId: 'Khiem', toId: 'Tyler', amountCents: 6000 },
			{ fromId: 'Taro', toId: 'Tyler', amountCents: 4000 }
		]);
	});

	it('returns no transfers when all balances are zero', () => {
		expect(
			settleUp([
				{ memberId: 'a', balanceCents: 0 },
				{ memberId: 'b', balanceCents: 0 }
			])
		).toEqual([]);
	});

	it('throws when balances do not sum to zero', () => {
		expect(() => settleUp([{ memberId: 'a', balanceCents: 100 }])).toThrow();
	});

	describe('fuzz', () => {
		function randInt(min: number, max: number) {
			return min + Math.floor(Math.random() * (max - min + 1));
		}

		it('produces at most n-1 positive transfers that zero every balance, over 200 random cases', () => {
			for (let trial = 0; trial < 200; trial++) {
				const n = randInt(2, 8);
				const ids = Array.from({ length: n }, (_, i) => `m${i}`);
				// random values that sum to 0
				const raw = ids.map(() => randInt(-1000, 1000));
				const drift = raw.reduce((a, b) => a + b, 0);
				raw[0] -= drift; // force exact sum to 0
				const balances = ids.map((memberId, i) => ({ memberId, balanceCents: raw[i] }));
				const nonZero = balances.filter((b) => b.balanceCents !== 0).length;

				const transfers = settleUp(balances);

				expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
				for (const t of transfers) {
					expect(t.amountCents).toBeGreaterThan(0);
					expect(Number.isInteger(t.amountCents)).toBe(true);
				}

				const result = new Map(balances.map((b) => [b.memberId, b.balanceCents]));
				for (const t of transfers) {
					result.set(t.fromId, (result.get(t.fromId) ?? 0) + t.amountCents);
					result.set(t.toId, (result.get(t.toId) ?? 0) - t.amountCents);
				}
				for (const v of result.values()) expect(v).toBe(0);
			}
		});
	});
});
