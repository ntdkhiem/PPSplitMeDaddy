<script lang="ts">
	import { enhance } from '$app/forms';
	import TemplateForm from '$lib/components/recurring/TemplateForm.svelte';
	import type { ShareInput, SplitMode } from '$lib/types';

	let { data, form } = $props();

	let description = $state(form?.values?.description ?? '');
	let category = $state(form?.values?.category ?? '');
	let amount = $state(form?.values?.amount ?? '');
	let payerId = $state(form?.values?.payerId || data.defaultPayerId);
	let dayOfMonth = $state(Number(form?.values?.dayOfMonth) || 1);
	let startPeriod = $state(form?.values?.startPeriod ?? data.defaultStartPeriod);
	let splitMode = $state<SplitMode>('equal');
	let participants = $state<ShareInput[]>(
		data.defaultParticipantIds.map((memberId) => ({ memberId }))
	);

	let submitting = $state(false);
</script>

<svelte:head>
	<title>New recurring bill · PPSplitMeDaddy</title>
</svelte:head>

<div class="page max-w-2xl">
	<h1 class="page-title">New recurring bill</h1>

	<form
		method="POST"
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
		/>

		{#if form?.error}
			<p class="error-text" role="alert">{form.error}</p>
		{/if}

		<div class="flex gap-2">
			<button class="btn btn-primary" disabled={submitting}>Create template</button>
			<a href="/recurring" class="btn btn-secondary">Cancel</a>
		</div>
	</form>
</div>
