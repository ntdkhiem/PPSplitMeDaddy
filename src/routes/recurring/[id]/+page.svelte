<script lang="ts">
	import { enhance } from '$app/forms';
	import TemplateForm from '$lib/components/recurring/TemplateForm.svelte';
	import { centsToInput } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	let { data, form } = $props();

	let description = $state(form?.values?.description ?? data.template.description);
	let category = $state(form?.values?.category ?? data.template.category ?? '');
	let amount = $state(
		form?.values?.amount ??
			(data.template.amountCents === null ? '' : centsToInput(data.template.amountCents))
	);
	let payerId = $state(form?.values?.payerId ?? data.template.payerId);
	let dayOfMonth = $state(Number(form?.values?.dayOfMonth) || data.template.dayOfMonth);
	let startPeriod = $state(form?.values?.startPeriod ?? data.template.startPeriod);
	let active = $state(form?.values?.active ?? data.template.active);
	let splitMode = $state<SplitMode>(data.template.splitMode);
	let participants = $state<ShareInput[]>(data.template.participants);

	let submitting = $state(false);
	let confirmingDelete = $state(false);
</script>

<svelte:head>
	<title>Edit recurring bill · PPSplitMeDaddy</title>
</svelte:head>

<div class="page max-w-2xl">
	<h1 class="page-title">Edit recurring bill</h1>

	<form
		method="POST"
		action="?/update"
		class="card space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<TemplateForm
			members={data.members}
			bind:description
			bind:category
			bind:amount
			bind:payerId
			bind:splitMode
			bind:participants
			bind:dayOfMonth
			bind:startPeriod
			bind:active
			showActiveToggle
		/>

		{#if form?.error}
			<p class="error-text" role="alert">{form.error}</p>
		{/if}

		<div class="flex gap-2">
			<button class="btn btn-primary" disabled={submitting}>Save changes</button>
			<a href="/recurring" class="btn btn-secondary">Cancel</a>
		</div>
	</form>

	<section class="card mt-4 border-rose-200">
		<h2 class="font-medium">Delete template</h2>
		<p class="muted mt-1">
			Templates that have already generated bills are deactivated instead of deleted, so past bills
			keep their history. Templates with no history are deleted outright.
		</p>

		<form method="POST" action="?/delete" use:enhance class="mt-3">
			{#if !confirmingDelete}
				<button type="button" class="btn btn-danger" onclick={() => (confirmingDelete = true)}>
					Delete template
				</button>
			{:else}
				<div class="flex flex-wrap items-center gap-2">
					<span class="error-text">Are you sure?</span>
					<button class="btn btn-danger">Yes, delete it</button>
					<button
						type="button"
						class="btn btn-secondary"
						onclick={() => (confirmingDelete = false)}
					>
						Cancel
					</button>
				</div>
			{/if}
		</form>
	</section>
</div>
