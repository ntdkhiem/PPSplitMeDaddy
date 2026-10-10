<!-- One posted expense in a list (expenses and groceries pages), linking to its edit page. -->
<script lang="ts">
	import { formatMoney } from '$lib/money';
	import type { ExpenseWithShares } from '$lib/server/services/expenses';

	let {
		expense: e,
		members,
		meId
	}: {
		expense: ExpenseWithShares;
		members: { id: string; name: string }[];
		meId: string;
	} = $props();

	const mine = $derived(e.shares.find((s) => s.memberId === meId));
	const payer = $derived(members.find((m) => m.id === e.payerId));
</script>

<li class="card">
	<a
		href="/expenses/{e.id}"
		class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
	>
		<div class="min-w-0 flex-1">
			<p class="font-medium break-words">{e.description}</p>
			<p class="muted">
				{e.date} · {payer?.name ?? 'Unknown'}{e.category ? ` · ${e.category}` : ''}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-4 text-sm">
			<span class="muted">You: {mine ? formatMoney(mine.amountCents) : '—'}</span>
			{#if e.amountCents < 0}
				<span class="amount-neg">Refund {formatMoney(-e.amountCents)}</span>
			{:else}
				<span class="font-medium tabular-nums">{formatMoney(e.amountCents)}</span>
			{/if}
		</div>
	</a>
</li>
