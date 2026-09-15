<!--
	Shared field set for creating/editing a recurring bill template. Rendered inside a
	<form method="POST"> by the /recurring/new and /recurring/[id] pages, which handle the
	submit action and server-side validation. This component only renders inputs (all bindable
	so the parent can prefill/read them if needed) plus the shared SplitEditor.
-->
<script lang="ts">
	import SplitEditor from '$lib/components/SplitEditor.svelte';
	import { parseMoney } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	interface MemberOption {
		id: string;
		name: string;
		active: boolean;
	}

	let {
		members,
		description = $bindable(''),
		category = $bindable(''),
		amount = $bindable(''),
		payerId = $bindable(''),
		splitMode = $bindable('equal'),
		participants = $bindable([]),
		dayOfMonth = $bindable(1),
		startPeriod = $bindable(''),
		active = $bindable(true),
		showActiveToggle = false
	}: {
		members: MemberOption[];
		description?: string;
		category?: string;
		amount?: string;
		payerId?: string;
		splitMode?: SplitMode;
		participants?: ShareInput[];
		dayOfMonth?: number;
		startPeriod?: string;
		active?: boolean;
		showActiveToggle?: boolean;
	} = $props();

	const amountCents = $derived.by(() => {
		const t = amount.trim();
		if (t === '') return null;
		return parseMoney(t);
	});

	const splitEditorMembers = $derived(members.map((m) => ({ id: m.id, name: m.name })));
</script>

<div class="space-y-4">
	<div>
		<label class="label" for="description">Description</label>
		<input
			class="input"
			id="description"
			name="description"
			required
			maxlength="200"
			bind:value={description}
		/>
	</div>

	<div>
		<label class="label" for="category">Category</label>
		<input class="input" id="category" name="category" maxlength="60" bind:value={category} />
	</div>

	<div>
		<label class="label" for="amount">Amount</label>
		<input
			class="input"
			id="amount"
			name="amount"
			inputmode="decimal"
			placeholder="Leave blank if it varies each month"
			bind:value={amount}
		/>
		<p class="muted mt-1">
			Leave blank for bills that vary (rent utilities, etc.) — each generated bill will be a draft
			you fill in.
		</p>
	</div>

	<div>
		<label class="label" for="payerId">Paid by</label>
		<select class="input" id="payerId" name="payerId" required bind:value={payerId}>
			<option value="" disabled>Choose who pays</option>
			{#each members as m (m.id)}
				<option value={m.id}>{m.name}{m.active ? '' : ' (inactive)'}</option>
			{/each}
		</select>
	</div>

	<SplitEditor
		members={splitEditorMembers}
		{amountCents}
		bind:splitMode
		bind:participants
		showPreview={amountCents !== null}
	/>

	<div class="grid grid-cols-2 gap-4">
		<div>
			<label class="label" for="dayOfMonth">Day of month</label>
			<input
				class="input"
				id="dayOfMonth"
				name="dayOfMonth"
				type="number"
				min="1"
				max="28"
				step="1"
				required
				bind:value={dayOfMonth}
			/>
		</div>
		<div>
			<label class="label" for="startPeriod">Start month</label>
			<input
				class="input"
				id="startPeriod"
				name="startPeriod"
				type="month"
				required
				bind:value={startPeriod}
			/>
		</div>
	</div>

	{#if showActiveToggle}
		<label class="flex items-center gap-2 text-sm text-slate-700">
			<input
				type="checkbox"
				class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
				name="active"
				bind:checked={active}
			/>
			Active (generates bills each month)
		</label>
	{/if}
</div>
