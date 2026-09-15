<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatMoney } from '$lib/money';

	let { data, form } = $props();

	let confirmingId = $state<string | null>(null);

	const values = $derived(form && 'values' in form && form.values ? form.values : data.prefill);
	const errors = $derived(form && 'errors' in form && form.errors ? form.errors : {});
</script>

<svelte:head>
	<title>Payments · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<h1 class="page-title">Payments</h1>

	<form method="GET" class="mb-4 flex flex-wrap items-end gap-2">
		<div>
			<label class="label" for="member-filter">Filter by member</label>
			<select
				id="member-filter"
				name="member"
				class="input"
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			>
				<option value="">All members</option>
				{#each data.members as m (m.id)}
					<option value={m.id} selected={m.id === data.memberFilter}>{m.name}</option>
				{/each}
			</select>
		</div>
	</form>

	<section class="card mb-6">
		<h2 class="mb-3 font-medium">Record a payment</h2>
		{#if form && 'success' in form && form.success}
			<p class="mb-3 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800" aria-live="polite">
				{form.success}
			</p>
		{/if}
		<form method="POST" action="?/record" class="grid gap-3 sm:grid-cols-2" use:enhance>
			<div>
				<label class="label" for="fromId">From</label>
				<select id="fromId" name="fromId" class="input" required>
					<option value="" disabled selected={!values.fromId}>Choose a member</option>
					{#each data.members as m (m.id)}
						<option value={m.id} selected={m.id === values.fromId}>{m.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="label" for="toId">To</label>
				<select id="toId" name="toId" class="input" required>
					<option value="" disabled selected={!values.toId}>Choose a member</option>
					{#each data.members as m (m.id)}
						<option value={m.id} selected={m.id === values.toId}>{m.name}</option>
					{/each}
				</select>
				{#if errors.toId}<p class="error-text mt-1" role="alert">{errors.toId}</p>{/if}
			</div>
			<div>
				<label class="label" for="amount">Amount</label>
				<input
					id="amount"
					name="amount"
					class="input"
					inputmode="decimal"
					placeholder="0.00"
					value={values.amount}
					required
				/>
				{#if errors.amount}<p class="error-text mt-1" role="alert">{errors.amount}</p>{/if}
			</div>
			<div>
				<label class="label" for="date">Date</label>
				<input id="date" name="date" type="date" class="input" value={values.date} required />
				{#if errors.date}<p class="error-text mt-1" role="alert">{errors.date}</p>{/if}
			</div>
			<div class="sm:col-span-2">
				<label class="label" for="note">Note (optional)</label>
				<input id="note" name="note" class="input" maxlength="500" value={values.note ?? ''} />
			</div>
			<div class="sm:col-span-2">
				<button class="btn btn-primary">Record payment</button>
			</div>
		</form>
	</section>

	<section class="card">
		<h2 class="mb-3 font-medium">History</h2>
		{#if data.payments.length === 0}
			<p class="muted">No payments recorded yet.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.payments as p (p.id)}
					<li class="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm">
									<strong>{p.fromName}</strong> paid <strong>{p.toName}</strong>
									<span class="amount-pos">{formatMoney(p.amountCents)}</span>
								</p>
								<p class="muted">
									{p.date}
									{#if p.note}
										· {p.note}{/if}
									{#if p.createdByName}
										· recorded by {p.createdByName}{/if}
								</p>
							</div>
							<div class="shrink-0">
								{#if confirmingId === p.id}
									<div class="flex gap-2">
										<form
											method="POST"
											action="?/delete"
											use:enhance={() => {
												return async ({ update }) => {
													confirmingId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={p.id} />
											<button class="btn btn-danger">Confirm delete</button>
										</form>
										<button
											type="button"
											class="btn btn-secondary"
											onclick={() => (confirmingId = null)}
										>
											Cancel
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="btn btn-secondary"
										onclick={() => (confirmingId = p.id)}
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
