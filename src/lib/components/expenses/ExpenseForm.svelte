<!--
	Shared create/edit form for /expenses/new and /expenses/[id]. The caller supplies the form
	action (?/create or ?/update), member options, categories, and initial values (either the
	existing expense or the last failed submit's values, re-rendered so nothing is lost on error).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SplitEditor from '$lib/components/SplitEditor.svelte';
	import { parseMoney } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	interface MemberOption {
		id: string;
		name: string;
	}

	interface InitialValues {
		description: string;
		/** absolute-value text, e.g. "12.34" — sign is controlled by isRefund */
		amount: string;
		isRefund: boolean;
		date: string;
		payerId: string;
		category: string;
		notes: string;
		splitMode: SplitMode;
		participants: ShareInput[];
	}

	let {
		action,
		members,
		splitMembers,
		categories,
		initial,
		errors = {},
		submitLabel,
		draftBanner = false
	}: {
		action: string;
		/** options for the "paid by" select */
		members: MemberOption[];
		/** options for the split picker */
		splitMembers: MemberOption[];
		categories: string[];
		initial: InitialValues;
		errors?: Record<string, string>;
		submitLabel: string;
		draftBanner?: boolean;
	} = $props();

	let description = $state(initial.description);
	let amountText = $state(initial.amount);
	let isRefund = $state(initial.isRefund);
	let date = $state(initial.date);
	let payerId = $state(initial.payerId);
	let category = $state(initial.category);
	let notes = $state(initial.notes);
	let splitMode = $state<SplitMode>(initial.splitMode);
	let participants = $state<ShareInput[]>(initial.participants);

	let submitting = $state(false);

	/** Live preview total fed to SplitEditor as the user types the amount. */
	const amountCents = $derived.by(() => {
		const magnitude = parseMoney(amountText);
		if (magnitude === null || magnitude === 0) return null;
		return isRefund ? -Math.abs(magnitude) : Math.abs(magnitude);
	});
</script>

<form
	method="POST"
	{action}
	enctype="multipart/form-data"
	class="space-y-5"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	{#if draftBanner}
		<p class="card border-amber-300 bg-amber-50 text-sm text-amber-900" role="status">
			This bill came from a recurring template; enter the amount to post it.
		</p>
	{/if}

	<div>
		<label class="label" for="description">Description</label>
		<input
			class="input"
			id="description"
			name="description"
			maxlength="120"
			required
			bind:value={description}
		/>
		{#if errors.description}<p class="error-text">{errors.description}</p>{/if}
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div>
			<label class="label" for="amount">Amount</label>
			<input
				class="input"
				id="amount"
				name="amount"
				inputmode="decimal"
				placeholder="0.00"
				required
				bind:value={amountText}
			/>
			<label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
				<input
					type="checkbox"
					name="isRefund"
					bind:checked={isRefund}
					class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
				/>
				This is a refund
			</label>
			{#if errors.amount}<p class="error-text">{errors.amount}</p>{/if}
		</div>

		<div>
			<label class="label" for="date">Date</label>
			<input class="input" id="date" name="date" type="date" required bind:value={date} />
			{#if errors.date}<p class="error-text">{errors.date}</p>{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div>
			<label class="label" for="payerId">Paid by</label>
			<select class="input" id="payerId" name="payerId" required bind:value={payerId}>
				{#each members as m (m.id)}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
			{#if errors.payerId}<p class="error-text">{errors.payerId}</p>{/if}
		</div>

		<div>
			<label class="label" for="category">Category</label>
			<input
				class="input"
				id="category"
				name="category"
				maxlength="60"
				list="expense-category-options"
				bind:value={category}
			/>
			<datalist id="expense-category-options">
				{#each categories as c (c)}<option value={c}></option>{/each}
			</datalist>
			{#if errors.category}<p class="error-text">{errors.category}</p>{/if}
		</div>
	</div>

	<div>
		<label class="label" for="notes">Notes</label>
		<textarea class="input" id="notes" name="notes" rows="3" bind:value={notes}></textarea>
		{#if errors.notes}<p class="error-text">{errors.notes}</p>{/if}
	</div>

	<SplitEditor members={splitMembers} {amountCents} bind:splitMode bind:participants />
	{#if errors.participants}<p class="error-text">{errors.participants}</p>{/if}

	<div>
		<label class="label" for="receipt">Receipt</label>
		<input
			class="input"
			id="receipt"
			name="receipt"
			type="file"
			accept="image/*,application/pdf"
			capture="environment"
		/>
		<p class="muted mt-1">JPEG, PNG, WebP, HEIC or PDF, up to 10 MB.</p>
		{#if errors.receipt}<p class="error-text">{errors.receipt}</p>{/if}
	</div>

	<div class="flex justify-end">
		<button class="btn btn-primary" disabled={submitting}>{submitLabel}</button>
	</div>
</form>
