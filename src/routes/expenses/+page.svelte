<script lang="ts">
	import { formatMoney } from '$lib/money';

	let { data } = $props();
</script>

<svelte:head>
	<title>Expenses · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<h1 class="page-title mb-0">Expenses</h1>
		<a href="/expenses/new" class="btn btn-primary">Add expense</a>
	</div>

	<form method="GET" class="card mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
		<div class="sm:col-span-2">
			<label class="label" for="search">Search</label>
			<input
				class="input"
				id="search"
				name="search"
				placeholder="Description or category"
				value={data.filters.search}
			/>
		</div>
		<div>
			<label class="label" for="member">Member</label>
			<select class="input" id="member" name="member">
				<option value="" selected={data.filters.member === ''}>Anyone</option>
				{#each data.members as m (m.id)}
					<option value={m.id} selected={m.id === data.filters.member}>{m.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class="label" for="status">Status</label>
			<select class="input" id="status" name="status">
				<option value="all" selected={data.filters.status === 'all'}>All</option>
				<option value="posted" selected={data.filters.status === 'posted'}>Posted</option>
				<option value="draft" selected={data.filters.status === 'draft'}>Draft</option>
			</select>
		</div>
		<div class="sm:col-span-4">
			<button class="btn btn-secondary">Filter</button>
		</div>
	</form>

	{#if data.drafts.length > 0}
		<section class="mb-6">
			<h2 class="mb-2 font-medium text-amber-900">Needs amount</h2>
			<ul class="space-y-2">
				{#each data.drafts as e (e.id)}
					<li class="card border-amber-300 bg-amber-50">
						<a
							href="/expenses/{e.id}"
							class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="min-w-0">
								<p class="font-medium break-words">{e.description}</p>
								<p class="muted">{e.date}{e.category ? ` · ${e.category}` : ''}</p>
							</div>
							<span
								class="w-fit rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900"
							>
								Needs amount
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.groups.length === 0 && data.drafts.length === 0}
		<p class="muted">No expenses match your filters.</p>
	{/if}

	{#each data.groups as g (g.key)}
		<section class="mb-6">
			<div class="mb-2 flex items-baseline justify-between">
				<h2 class="font-medium">{g.label}</h2>
				<span class="muted tabular-nums">{formatMoney(g.totalCents)}</span>
			</div>
			<ul class="space-y-2">
				{#each g.expenses as e (e.id)}
					{@const mine = e.shares.find((s) => s.memberId === data.meId)}
					{@const payer = data.members.find((m) => m.id === e.payerId)}
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
				{/each}
			</ul>
		</section>
	{/each}
</div>
