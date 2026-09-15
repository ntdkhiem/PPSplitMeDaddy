<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatMoney } from '$lib/money';
	import { barWidthPct, maxAbsBalance } from '$lib/components/dashboard/bars';

	let { data, form } = $props();

	const nameById = $derived(new Map(data.members.map((m) => [m.id, m.name])));

	const myBalance = $derived(
		data.meId ? (data.balances.find((b) => b.memberId === data.meId)?.balanceCents ?? 0) : 0
	);

	const shownBalances = $derived(
		data.balances
			.map((b) => ({ ...b, member: data.members.find((m) => m.id === b.memberId) }))
			.filter((b) => b.member && (b.member.active || b.balanceCents !== 0))
	);

	const maxAbs = $derived(maxAbsBalance(shownBalances.map((b) => b.balanceCents)));

	function memberName(id: string) {
		return nameById.get(id) ?? 'Unknown';
	}
</script>

<svelte:head>
	<title>Dashboard · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<h1 class="page-title">Dashboard</h1>

	{#if !data.hasAnyActivity}
		<section class="card">
			<h2 class="mb-1 font-medium">No expenses yet</h2>
			<p class="muted mb-3">Add your first expense, or import from a spreadsheet.</p>
			<div class="flex flex-wrap gap-2">
				<a href="/expenses/new" class="btn btn-primary">Add an expense</a>
				<a href="/import" class="btn btn-secondary">Import</a>
			</div>
		</section>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			<section class="card sm:col-span-2">
				{#if myBalance > 0}
					<p class="text-lg">
						You are owed <span class="amount-pos">{formatMoney(myBalance)}</span>
					</p>
				{:else if myBalance < 0}
					<p class="text-lg">You owe <span class="amount-neg">{formatMoney(-myBalance)}</span></p>
				{:else}
					<p class="text-lg">You're all settled up</p>
				{/if}
			</section>

			<section class="card">
				<h2 class="mb-3 font-medium">Balances</h2>
				{#if shownBalances.length === 0}
					<p class="muted">No balances yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each shownBalances as b (b.memberId)}
							<li>
								<div class="mb-1 flex items-center justify-between gap-2 text-sm">
									<span class="min-w-0 truncate {b.member?.active ? '' : 'opacity-60'}">
										{b.member?.name ?? 'Unknown'}
									</span>
									{#if b.balanceCents > 0}
										<span class="amount-pos shrink-0">{formatMoney(b.balanceCents)}</span>
									{:else if b.balanceCents < 0}
										<span class="amount-neg shrink-0">{formatMoney(b.balanceCents)}</span>
									{:else}
										<span class="muted shrink-0">$0.00</span>
									{/if}
								</div>
								<div class="flex h-2 items-stretch">
									<div class="flex flex-1 justify-end overflow-hidden rounded-l bg-slate-100">
										{#if b.balanceCents < 0}
											<div
												class="h-full rounded-l bg-rose-500"
												style="width: {barWidthPct(b.balanceCents, maxAbs)}%"
											></div>
										{/if}
									</div>
									<div class="w-px shrink-0 bg-slate-300"></div>
									<div class="flex-1 overflow-hidden rounded-r bg-slate-100">
										{#if b.balanceCents > 0}
											<div
												class="h-full rounded-r bg-emerald-500"
												style="width: {barWidthPct(b.balanceCents, maxAbs)}%"
											></div>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card">
				<h2 class="mb-3 font-medium">Settle up</h2>
				{#if form && 'success' in form && form.success}
					<p class="mb-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800" aria-live="polite">
						{form.success}
					</p>
				{:else if form && 'error' in form && form.error}
					<p class="error-text mb-3" role="alert">{form.error}</p>
				{/if}
				{#if data.transfers.length === 0}
					<p class="muted">Nothing to settle — everyone's even.</p>
				{:else}
					<ul class="space-y-2">
						{#each data.transfers as t (t.fromId + t.toId + t.amountCents)}
							<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
								<span>
									<strong>{memberName(t.fromId)}</strong> pays <strong>{memberName(t.toId)}</strong>
									<span class="amount-neg">{formatMoney(t.amountCents)}</span>
								</span>
								<form method="POST" action="?/record" use:enhance>
									<input type="hidden" name="fromId" value={t.fromId} />
									<input type="hidden" name="toId" value={t.toId} />
									<input type="hidden" name="amountCents" value={t.amountCents} />
									<button class="btn btn-secondary">Record payment</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card">
				<h2 class="mb-3 font-medium">Needs attention</h2>
				{#if data.draftExpenses.length === 0}
					<p class="muted">Nothing needs attention.</p>
				{:else}
					<p class="muted mb-2">
						{data.draftExpenses.length} draft expense{data.draftExpenses.length === 1 ? '' : 's'}
						{data.draftExpenses.length === 1 ? 'needs' : 'need'} an amount.
					</p>
					<ul class="space-y-1 text-sm">
						{#each data.draftExpenses as d (d.id)}
							<li>
								<a class="text-emerald-700 hover:underline" href="/expenses/{d.id}"
									>{d.description}</a
								>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="card sm:col-span-2">
				<h2 class="mb-3 font-medium">Recent activity</h2>
				{#if data.activity.length === 0}
					<p class="muted">No activity yet.</p>
				{:else}
					<ul class="space-y-2 text-sm">
						{#each data.activity as item (item.kind + item.id)}
							<li
								class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
							>
								{#if item.kind === 'expense'}
									<a class="min-w-0 truncate hover:underline" href="/expenses/{item.id}">
										{memberName(item.payerId)} paid {formatMoney(item.amountCents)} for {item.description}
									</a>
								{:else}
									<a class="min-w-0 truncate hover:underline" href="/payments">
										{memberName(item.fromId)} paid {memberName(item.toId)}
										{formatMoney(item.amountCents)}
									</a>
								{/if}
								<span class="muted shrink-0">{item.date}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}
</div>
