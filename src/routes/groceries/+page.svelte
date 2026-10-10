<script lang="ts">
	import { enhance } from '$app/forms';
	import ExpenseRow from '$lib/components/expenses/ExpenseRow.svelte';
	import { formatMoney } from '$lib/money';

	let { data, form } = $props();

	let editingBudget = $state(false);
	let saving = $state(false);

	const fund = $derived(data.fund);
	const showBudgetForm = $derived(
		editingBudget || fund.budgetCents === null || !!form?.budgetError
	);
	/** share of the budget used, 0..100 (capped for the bar) */
	const usedPct = $derived(
		fund.budgetCents ? Math.min(100, Math.max(0, (fund.spentCents / fund.budgetCents) * 100)) : 0
	);
	const over = $derived(fund.remainingCents !== null && fund.remainingCents < 0);
	const barColor = $derived(
		over ? 'bg-rose-500' : usedPct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'
	);
</script>

<svelte:head>
	<title>Groceries · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<h1 class="page-title mb-0">Groceries</h1>
		<a href="/expenses/new?category={encodeURIComponent(data.category)}" class="btn btn-primary"
			>Add grocery</a
		>
	</div>

	<section class="card mb-6" aria-labelledby="fund-heading">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="fund-heading" class="font-medium">{data.month.label} grocery fund</h2>
			{#if fund.budgetCents !== null && !showBudgetForm}
				<button
					type="button"
					class="text-sm text-emerald-700 hover:underline"
					onclick={() => (editingBudget = true)}>Edit budget</button
				>
			{/if}
		</div>

		{#if fund.budgetCents !== null}
			<p
				class="mt-3 text-3xl font-semibold tabular-nums {over ? 'text-rose-700' : 'text-slate-900'}"
			>
				{formatMoney(Math.abs(fund.remainingCents ?? 0))}
				<span class="text-base font-normal text-slate-500">{over ? 'over budget' : 'left'}</span>
			</p>
			<div
				class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
				role="progressbar"
				aria-label="Grocery budget used"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(usedPct)}
			>
				<div class="h-full rounded-full {barColor}" style="width: {usedPct}%"></div>
			</div>
			<p class="muted mt-2 tabular-nums">
				Spent {formatMoney(fund.spentCents)} of {formatMoney(fund.budgetCents)}
			</p>
		{:else}
			<p class="mt-2 text-sm text-slate-700">
				Spent <span class="font-medium tabular-nums">{formatMoney(fund.spentCents)}</span> this month.
				Set a monthly budget to track what's left.
			</p>
		{/if}

		{#if showBudgetForm}
			<form
				method="POST"
				action="?/setBudget"
				class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						await update();
						saving = false;
						if (result.type === 'success') editingBudget = false;
					};
				}}
			>
				<div class="sm:w-48">
					<label class="label" for="amount">Monthly budget</label>
					<input
						class="input"
						id="amount"
						name="amount"
						inputmode="decimal"
						placeholder="400.00"
						required
						value={form?.amount ?? data.budgetInput}
					/>
				</div>
				<div class="flex gap-2">
					<button class="btn btn-primary" disabled={saving}>Save budget</button>
					{#if fund.budgetCents !== null}
						<button type="button" class="btn btn-secondary" onclick={() => (editingBudget = false)}
							>Cancel</button
						>
					{/if}
				</div>
			</form>
			{#if form?.budgetError}<p class="error-text mt-1">{form.budgetError}</p>{/if}
			<p class="muted mt-2">
				Applies from {data.month.label} onward; earlier months keep their budget.
			</p>
		{/if}
	</section>

	{#if data.drafts.length > 0}
		<section class="mb-6">
			<h2 class="mb-2 font-medium text-amber-900">Needs amount</h2>
			<ul class="space-y-2">
				{#each data.drafts as e (e.id)}
					<li class="card border-amber-300 bg-amber-50">
						<a href="/expenses/{e.id}" class="block">
							<p class="font-medium break-words">{e.description}</p>
							<p class="muted">{e.date} · not counted until it has an amount</p>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.groups.length === 0}
		<p class="muted">
			No grocery expenses yet. Expenses with the category “{data.category}” show up here.
		</p>
	{/if}

	{#each data.groups as g (g.key)}
		<section class="mb-6">
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<h2 class="font-medium">{g.label}</h2>
				<span class="muted tabular-nums">
					{formatMoney(g.totalCents)}{g.budgetCents !== null
						? ` of ${formatMoney(g.budgetCents)}`
						: ''}
				</span>
			</div>
			<ul class="space-y-2">
				{#each g.expenses as e (e.id)}
					<ExpenseRow expense={e} members={data.members} meId={data.meId} />
				{/each}
			</ul>
		</section>
	{/each}
</div>
