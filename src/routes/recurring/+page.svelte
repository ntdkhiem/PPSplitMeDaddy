<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { formatMoney, today } from '$lib/money';
	import { nextDueDate } from '$lib/components/recurring/next-due';

	let { data, form } = $props();

	const memberName = (id: string) => data.members.find((m) => m.id === id)?.name ?? 'Unknown';

	const createdParam = $derived(page.url.searchParams.get('created'));
	const deletedParam = $derived(page.url.searchParams.get('deleted'));
	const deactivatedParam = $derived(page.url.searchParams.get('deactivated'));
</script>

<svelte:head>
	<title>Recurring · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<h1 class="page-title mb-0">Recurring bills</h1>
		<a href="/recurring/new" class="btn btn-primary">New template</a>
	</div>

	{#if createdParam !== null}
		<p class="card mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800" role="status">
			{createdParam === '0'
				? 'Saved. No bills were due yet.'
				: `Saved. Created ${createdParam} bill(s).`}
		</p>
	{/if}

	{#if deletedParam !== null}
		<p class="card mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800" role="status">
			Template deleted.
		</p>
	{:else if deactivatedParam !== null}
		<p class="card mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800" role="status">
			Template has expense history, so it was deactivated instead of deleted.
		</p>
	{/if}

	<form method="POST" action="?/generate" use:enhance class="card mb-4 flex items-center gap-3">
		<div class="flex-1">
			<p class="font-medium">Generate due bills now</p>
			<p class="muted">
				Bills are generated automatically every morning; use this to check right away.
			</p>
		</div>
		<button class="btn btn-secondary shrink-0">Generate due bills now</button>
	</form>

	{#if form && 'generated' in form}
		<p class="muted mb-4" role="status">
			{form.generated === 0 ? 'No bills were due.' : `Created ${form.generated} bill(s).`}
		</p>
	{/if}

	{#if data.templates.length === 0}
		<p class="muted">No recurring templates yet.</p>
	{:else}
		<ul class="space-y-3">
			{#each data.templates as tpl (tpl.id)}
				{@const due = nextDueDate(tpl, today())}
				<li class="card">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="font-medium break-words">
								{tpl.description}
								{#if tpl.category}<span class="muted">· {tpl.category}</span>{/if}
							</p>
							<p class="muted">
								{tpl.amountCents === null ? 'Varies' : formatMoney(tpl.amountCents)} · paid by {memberName(
									tpl.payerId
								)}
							</p>
							<p class="muted">
								Split with {tpl.participants.map((p) => memberName(p.memberId)).join(', ')}
							</p>
							<p class="muted">Monthly on day {tpl.dayOfMonth}</p>
						</div>
						<div class="flex flex-col items-end gap-1">
							<span
								class="rounded-full px-2 py-0.5 text-xs {tpl.active
									? 'bg-emerald-100 text-emerald-800'
									: 'bg-rose-100 text-rose-800'}">{tpl.active ? 'active' : 'inactive'}</span
							>
							{#if tpl.active}
								<span class="muted text-xs">Next due {due}</span>
							{/if}
						</div>
					</div>
					<div class="mt-3">
						<a href="/recurring/{tpl.id}" class="btn btn-secondary">Edit</a>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
