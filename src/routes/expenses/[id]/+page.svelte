<script lang="ts">
	import { enhance } from '$app/forms';
	import ExpenseForm from '$lib/components/expenses/ExpenseForm.svelte';
	import { centsToInput } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	let { data, form } = $props();

	let confirmingDelete = $state(false);

	function safeParticipants(json: string | undefined): ShareInput[] {
		try {
			const parsed = JSON.parse(json ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function sharesToParticipants(
		mode: SplitMode,
		shares: { memberId: string; weight: number | null; amountCents: number }[]
	): ShareInput[] {
		return shares.map((s) => {
			if (mode === 'shares') return { memberId: s.memberId, weight: s.weight ?? 1 };
			if (mode === 'exact') return { memberId: s.memberId, amountCents: s.amountCents };
			return { memberId: s.memberId };
		});
	}

	const initial = $derived(
		form?.values
			? {
					description: form.values.description,
					amount: form.values.amount,
					isRefund: form.values.isRefund,
					date: form.values.date,
					payerId: form.values.payerId,
					category: form.values.category,
					notes: form.values.notes,
					splitMode: (form.values.splitMode as SplitMode) ?? data.expense.splitMode,
					participants: safeParticipants(form.values.participants)
				}
			: {
					description: data.expense.description,
					amount: centsToInput(Math.abs(data.expense.amountCents)),
					isRefund: data.expense.amountCents < 0,
					date: data.expense.date,
					payerId: data.expense.payerId,
					category: data.expense.category ?? '',
					notes: data.expense.notes ?? '',
					splitMode: data.expense.splitMode as SplitMode,
					participants: sharesToParticipants(
						data.expense.splitMode as SplitMode,
						data.expense.shares
					)
				}
	);

	const receiptIsPdf = $derived(data.expense.receiptPath?.endsWith('.pdf') ?? false);

	function formatTs(d: Date | null): string {
		return d ? new Date(d).toLocaleString() : '—';
	}
</script>

<svelte:head>
	<title>Edit expense · PPSplitMeDaddy</title>
</svelte:head>

<div class="page max-w-2xl">
	<h1 class="page-title">Edit expense</h1>

	{#if data.expense.receiptPath}
		<div class="card mb-4">
			<h2 class="mb-2 font-medium">Receipt</h2>
			{#if receiptIsPdf}
				<a
					class="text-emerald-700 hover:underline"
					href="/receipts/{data.expense.receiptPath}"
					target="_blank"
					rel="noopener"
				>
					Open PDF receipt
				</a>
			{:else}
				<img
					src="/receipts/{data.expense.receiptPath}"
					alt="Receipt"
					class="max-h-80 rounded-lg border border-slate-200"
				/>
			{/if}
			<form method="POST" action="?/removeReceipt" use:enhance class="mt-2">
				<button class="btn btn-secondary">Remove receipt</button>
			</form>
		</div>
	{/if}

	<div class="card">
		<ExpenseForm
			action="?/update"
			members={data.members}
			splitMembers={data.members}
			categories={data.categories}
			{initial}
			errors={form?.errors ?? {}}
			submitLabel="Save changes"
			draftBanner={data.expense.status === 'draft'}
		/>
	</div>

	<div class="card mt-4 flex flex-wrap items-center justify-between gap-3">
		<p class="muted">
			Created {formatTs(data.expense.createdAt)} · Updated {formatTs(data.expense.updatedAt)}
		</p>
		<form method="POST" action="?/delete" use:enhance>
			{#if confirmingDelete}
				<div class="flex gap-2">
					<button type="submit" class="btn btn-danger">Confirm delete</button>
					<button
						type="button"
						class="btn btn-secondary"
						onclick={() => (confirmingDelete = false)}
					>
						Cancel
					</button>
				</div>
			{:else}
				<button type="button" class="btn btn-danger" onclick={() => (confirmingDelete = true)}>
					Delete
				</button>
			{/if}
		</form>
	</div>
</div>
