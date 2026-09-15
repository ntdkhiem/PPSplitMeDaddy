<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatMoney, today } from '$lib/money';

	let { data, form } = $props();

	let submitting = $state(false);

	const errorMessage = $derived(form && 'error' in form ? form.error : undefined);
	const resultData = $derived(form && 'result' in form ? form.result : undefined);
	const parsedData = $derived(form && 'parsed' in form ? form.parsed : undefined);
	const importDate = $derived(form && 'importDate' in form ? form.importDate : undefined);

	function defaultMemberId(name: string): string {
		const n = name.trim().toLowerCase();
		const match = data.members.find((m) => m.name.toLowerCase() === n);
		return match?.id ?? '';
	}
</script>

<svelte:head>
	<title>Import · PPSplitMeDaddy</title>
</svelte:head>

<div class="page max-w-3xl">
	<h1 class="page-title">Import spreadsheet</h1>

	<div class="card mb-4">
		<p class="muted">
			Upload the household's old bill-tracking workbook. Sheets named "&lt;Person&gt; Bills" are
			imported: each checked row becomes an expense paid by that person and split equally among the
			people checked in that row. "Sum"/"Calculator" sheets and the paid checkboxes are not imported
			— every imported row becomes a normal posted expense.
		</p>
	</div>

	{#if resultData}
		<section class="card border-emerald-300 bg-emerald-50">
			<h2 class="font-medium text-emerald-800">Import complete</h2>
			<p class="mt-1 text-emerald-800">Created {resultData.created} expense(s).</p>
			{#if resultData.skipped.length > 0}
				<div class="mt-3">
					<p class="font-medium text-emerald-900">Skipped ({resultData.skipped.length}):</p>
					<ul class="muted list-disc pl-5">
						{#each resultData.skipped as msg}
							<li>{msg}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div class="mt-4 flex gap-2">
				<a href="/expenses" class="btn btn-primary">View expenses</a>
				<a href="/import" class="btn btn-secondary">Import another file</a>
			</div>
		</section>
	{:else if parsedData}
		{@const parsed = parsedData}
		{#if errorMessage}
			<p class="error-text mb-4" role="alert">{errorMessage}</p>
		{/if}

		<form
			method="POST"
			action="?/commit"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<input type="hidden" name="workbook" value={JSON.stringify(parsed)} />

			{#each parsed.sheets as sheet (sheet.sheetName)}
				<section class="card mb-4">
					<h2 class="font-medium">{sheet.sheetName} · paid by {sheet.payerName}</h2>
					{#if sheet.rows.length === 0}
						<p class="muted mt-2">No importable rows.</p>
					{:else}
						<div class="mt-2 overflow-x-auto">
							<table class="w-full text-left text-sm">
								<thead>
									<tr class="border-b border-slate-200 text-slate-500">
										<th class="py-1 pr-2">Row</th>
										<th class="py-1 pr-2">Description</th>
										<th class="py-1 pr-2">Amount</th>
										<th class="py-1 pr-2">Participants</th>
									</tr>
								</thead>
								<tbody>
									{#each sheet.rows as row (row.row)}
										<tr class="border-b border-slate-100">
											<td class="py-1 pr-2 text-slate-500">{row.row}</td>
											<td class="py-1 pr-2">{row.description}</td>
											<td class="py-1 pr-2 tabular-nums">{formatMoney(row.amountCents)}</td>
											<td class="py-1 pr-2">{row.participantNames.join(', ')}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
					{#if sheet.skipped.length > 0}
						<div class="mt-2">
							<p class="muted">Skipped:</p>
							<ul class="muted list-disc pl-5">
								{#each sheet.skipped as msg}
									<li>{msg}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/each}

			<section class="card mb-4">
				<h2 class="mb-2 font-medium">Map people to members</h2>
				<p class="muted mb-3">
					Each name found in the workbook (as a payer or a participant column) needs a member, or
					can be skipped.
				</p>
				<div class="space-y-2">
					{#each parsed.people as name, i (name)}
						<div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
							<span class="w-40 shrink-0 font-medium break-words">{name}</span>
							<select class="input" name="mapping-{i}" value={defaultMemberId(name)}>
								<option value="">Don't import this person</option>
								{#each data.members as m (m.id)}
									<option value={m.id}>{m.name}</option>
								{/each}
							</select>
						</div>
					{/each}
				</div>
			</section>

			<section class="card mb-4 space-y-3">
				<div>
					<label class="label" for="date">Import date</label>
					<input
						class="input max-w-xs"
						id="date"
						name="date"
						type="date"
						value={importDate ?? today()}
					/>
				</div>
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<input
						type="checkbox"
						class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
						name="skipExisting"
						checked
					/>
					Skip rows already imported (safe to re-run)
				</label>
			</section>

			<button class="btn btn-primary" disabled={submitting}>Import</button>
		</form>
	{:else}
		{#if errorMessage}
			<p class="error-text mb-4" role="alert">{errorMessage}</p>
		{/if}
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			class="card space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<div>
				<label class="label" for="file">Workbook (.xlsx)</label>
				<input class="input" id="file" name="file" type="file" accept=".xlsx" required />
			</div>
			<button class="btn btn-primary" disabled={submitting}>Upload &amp; preview</button>
		</form>
	{/if}
</div>
