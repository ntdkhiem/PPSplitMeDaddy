<script lang="ts">
	import ExpenseForm from '$lib/components/expenses/ExpenseForm.svelte';
	import { today } from '$lib/money';
	import type { ShareInput, SplitMode } from '$lib/types';

	let { data, form } = $props();

	function safeParticipants(json: string | undefined): ShareInput[] {
		try {
			const parsed = JSON.parse(json ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
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
					splitMode: (form.values.splitMode as SplitMode) ?? 'equal',
					participants: safeParticipants(form.values.participants)
				}
			: {
					description: '',
					amount: '',
					isRefund: false,
					date: today(),
					payerId: data.member?.id ?? data.members[0]?.id ?? '',
					category: '',
					notes: '',
					splitMode: 'equal' as SplitMode,
					participants: data.members.map((m) => ({ memberId: m.id }))
				}
	);
</script>

<svelte:head>
	<title>Add expense · PPSplitMeDaddy</title>
</svelte:head>

<div class="page max-w-2xl">
	<h1 class="page-title">Add expense</h1>
	<div class="card">
		<ExpenseForm
			action="?/create"
			members={data.members}
			splitMembers={data.members}
			categories={data.categories}
			{initial}
			errors={form?.errors ?? {}}
			submitLabel="Add expense"
		/>
	</div>
</div>
