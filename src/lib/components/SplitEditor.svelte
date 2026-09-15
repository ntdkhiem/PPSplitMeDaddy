<!--
	Participant + split-mode picker shared by the expense and recurring forms.
	Emits hidden inputs `splitMode` and `participants` (JSON ShareInput[]); parse them on the server
	with parseSplitFields() from $lib/server/forms.
-->
<script lang="ts">
	import { splitAmount, SplitError } from '$lib/ledger';
	import { centsToInput, formatMoney, parseMoney } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	interface MemberOption {
		id: string;
		name: string;
	}

	let {
		members,
		amountCents,
		splitMode = $bindable('equal'),
		participants = $bindable([]),
		/** hide the live per-person preview (e.g. variable-amount recurring bills) */
		showPreview = true
	}: {
		members: MemberOption[];
		/** total in cents, or null when the amount is unknown/invalid */
		amountCents: number | null;
		splitMode?: SplitMode;
		participants?: ShareInput[];
		showPreview?: boolean;
	} = $props();

	const modes: { value: SplitMode; label: string }[] = [
		{ value: 'equal', label: 'Equally' },
		{ value: 'shares', label: 'By shares' },
		{ value: 'exact', label: 'Exact amounts' }
	];

	// Per-member UI state, keyed by member id (kept even when unchecked so toggling doesn't lose input).
	let weights = $state<Record<string, number>>({});
	let exactInputs = $state<Record<string, string>>({});
	for (const p of participants) {
		if (p.weight !== undefined) weights[p.memberId] = p.weight;
		if (p.amountCents !== undefined) exactInputs[p.memberId] = centsToInput(p.amountCents);
	}

	const selected = $derived(new Set(participants.map((p) => p.memberId)));

	function build(ids: Set<string>): ShareInput[] {
		// keep member-list order so remainder cents are distributed deterministically
		return members
			.filter((m) => ids.has(m.id))
			.map((m) => {
				if (splitMode === 'shares') return { memberId: m.id, weight: weights[m.id] ?? 1 };
				if (splitMode === 'exact') {
					const cents = parseMoney(exactInputs[m.id] ?? '');
					return { memberId: m.id, amountCents: cents ?? undefined };
				}
				return { memberId: m.id };
			});
	}

	function refresh(ids: Set<string> = selected) {
		participants = build(ids);
	}

	function toggle(id: string, checked: boolean) {
		const ids = new Set(selected);
		if (checked) ids.add(id);
		else ids.delete(id);
		refresh(ids);
	}

	function setAll(checked: boolean) {
		refresh(new Set(checked ? members.map((m) => m.id) : []));
	}

	const preview = $derived.by(() => {
		if (amountCents === null || amountCents === 0 || participants.length === 0) return null;
		try {
			const shares = splitAmount(amountCents, splitMode, participants);
			return { ok: true as const, byId: new Map(shares.map((s) => [s.memberId, s.amountCents])) };
		} catch (e) {
			return { ok: false as const, message: e instanceof SplitError ? e.message : 'Invalid split' };
		}
	});

	const exactRemaining = $derived.by(() => {
		if (splitMode !== 'exact' || amountCents === null) return null;
		const sum = participants.reduce((a, p) => a + (p.amountCents ?? 0), 0);
		return amountCents - sum;
	});
</script>

<fieldset class="space-y-3">
	<legend class="label">Split</legend>

	<input type="hidden" name="splitMode" value={splitMode} />
	<input type="hidden" name="participants" value={JSON.stringify(participants)} />

	<div class="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="radiogroup">
		{#each modes as mode (mode.value)}
			<button
				type="button"
				role="radio"
				aria-checked={splitMode === mode.value}
				class="rounded-md px-3 py-1.5 {splitMode === mode.value
					? 'bg-emerald-600 text-white'
					: 'text-slate-700 hover:bg-slate-100'}"
				onclick={() => {
					splitMode = mode.value;
					refresh();
				}}>{mode.label}</button
			>
		{/each}
	</div>

	<div class="flex gap-3 text-sm">
		<button type="button" class="text-emerald-700 hover:underline" onclick={() => setAll(true)}
			>Select all</button
		>
		<button type="button" class="text-slate-600 hover:underline" onclick={() => setAll(false)}
			>Clear</button
		>
	</div>

	<ul class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
		{#each members as m (m.id)}
			{@const checked = selected.has(m.id)}
			<li class="flex items-center gap-3 px-3 py-2">
				<label class="flex flex-1 items-center gap-2">
					<input
						type="checkbox"
						class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
						{checked}
						onchange={(e) => toggle(m.id, e.currentTarget.checked)}
					/>
					<span>{m.name}</span>
				</label>

				{#if checked && splitMode === 'shares'}
					<label class="flex items-center gap-1 text-sm text-slate-600">
						<input
							type="number"
							min="1"
							step="1"
							class="input w-20"
							aria-label="Shares for {m.name}"
							value={weights[m.id] ?? 1}
							oninput={(e) => {
								weights[m.id] = Math.max(1, Math.floor(Number(e.currentTarget.value) || 1));
								refresh();
							}}
						/>
						shares
					</label>
				{:else if checked && splitMode === 'exact'}
					<input
						type="text"
						inputmode="decimal"
						class="input w-28 text-right"
						placeholder="0.00"
						aria-label="Amount for {m.name}"
						value={exactInputs[m.id] ?? ''}
						oninput={(e) => {
							exactInputs[m.id] = e.currentTarget.value;
							refresh();
						}}
					/>
				{/if}

				{#if showPreview && checked && preview?.ok}
					<span class="w-24 text-right text-sm text-slate-600 tabular-nums"
						>{formatMoney(preview.byId.get(m.id) ?? 0)}</span
					>
				{/if}
			</li>
		{/each}
	</ul>

	{#if participants.length === 0}
		<p class="muted">Pick at least one person.</p>
	{:else if exactRemaining !== null && exactRemaining !== 0}
		<p class="error-text">
			{exactRemaining > 0 ? `${formatMoney(exactRemaining)} left to assign` : `${formatMoney(-exactRemaining)} over the total`}
		</p>
	{:else if showPreview && preview && !preview.ok}
		<p class="error-text">{preview.message}</p>
	{/if}
</fieldset>
