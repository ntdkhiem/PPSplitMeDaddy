<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let copied = $state(false);
	let editingId = $state<string | null>(null);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	const resultFor = (id: string) =>
		form && 'memberId' in form && form.memberId === id ? form : null;
</script>

<svelte:head>
	<title>Members · PPSplitMeDaddy</title>
</svelte:head>

<div class="page">
	<h1 class="page-title">Members</h1>

	{#if form?.invite}
		<section class="card mb-4 border-emerald-300 bg-emerald-50" aria-live="polite">
			<h2 class="font-medium">
				{form.invite.reset ? 'Password reset link' : 'Invite link'} for {form.invite.name}
			</h2>
			<p class="muted mb-2">
				Copy it now — it won't be shown again. It works once and expires in 7 days.
			</p>
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					class="input font-mono"
					readonly
					value={form.invite.url}
					aria-label="Invite link"
					onfocus={(e) => e.currentTarget.select()}
				/>
				<button
					type="button"
					class="btn btn-primary shrink-0"
					onclick={() => copy(form!.invite!.url)}
				>
					{copied ? 'Copied!' : 'Copy link'}
				</button>
			</div>
		</section>
	{/if}

	<ul class="space-y-3">
		{#each data.members as m (m.id)}
			{@const result = resultFor(m.id)}
			<li class="card {m.active ? '' : 'opacity-70'}">
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="font-medium break-words">
							{m.name}
							{#if m.id === data.meId}<span class="muted">(you)</span>{/if}
						</p>
						<p class="muted break-all">{m.email ?? 'No email'}</p>
					</div>
					<div class="flex flex-wrap gap-1 text-xs">
						<span
							class="rounded-full px-2 py-0.5 {m.role === 'admin'
								? 'bg-emerald-100 text-emerald-800'
								: 'bg-slate-100 text-slate-700'}">{m.role}</span
						>
						<span
							class="rounded-full px-2 py-0.5 {m.hasLogin
								? 'bg-sky-100 text-sky-800'
								: 'bg-slate-100 text-slate-600'}">{m.hasLogin ? 'has login' : 'no login'}</span
						>
						<span
							class="rounded-full px-2 py-0.5 {m.active
								? 'bg-emerald-100 text-emerald-800'
								: 'bg-rose-100 text-rose-800'}">{m.active ? 'active' : 'inactive'}</span
						>
					</div>
				</div>

				{#if data.isAdmin}
					{#if editingId === m.id}
						<form
							method="POST"
							action="?/rename"
							class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
							use:enhance={() =>
								async ({ result: r, update }) => {
									await update({ reset: false });
									if (r.type === 'success') editingId = null;
								}}
						>
							<input type="hidden" name="id" value={m.id} />
							<div class="flex-1">
								<label class="label" for="name-{m.id}">New name</label>
								<input
									class="input"
									id="name-{m.id}"
									name="name"
									value={m.name}
									required
									maxlength="60"
								/>
							</div>
							<div class="flex gap-2">
								<button class="btn btn-primary">Save</button>
								<button type="button" class="btn btn-secondary" onclick={() => (editingId = null)}>
									Cancel
								</button>
							</div>
						</form>
					{/if}

					<div class="mt-3 flex flex-wrap gap-2">
						{#if editingId !== m.id}
							<button type="button" class="btn btn-secondary" onclick={() => (editingId = m.id)}>
								Rename
							</button>
						{/if}
						<form method="POST" action="?/setRole" use:enhance>
							<input type="hidden" name="id" value={m.id} />
							<input type="hidden" name="role" value={m.role === 'admin' ? 'member' : 'admin'} />
							<button class="btn btn-secondary">
								{m.role === 'admin' ? 'Make member' : 'Make admin'}
							</button>
						</form>
						<form method="POST" action="?/setActive" use:enhance>
							<input type="hidden" name="id" value={m.id} />
							<input type="hidden" name="active" value={m.active ? 'false' : 'true'} />
							<button class="btn {m.active ? 'btn-danger' : 'btn-secondary'}">
								{m.active ? 'Deactivate' : 'Activate'}
							</button>
						</form>
						{#if m.active}
							<form method="POST" action="?/invite" use:enhance>
								<input type="hidden" name="id" value={m.id} />
								<button class="btn btn-secondary">
									{m.hasLogin ? 'Reset password link' : 'Invite link'}
								</button>
							</form>
						{/if}
					</div>
				{/if}

				{#if result && 'error' in result && result.error}
					<p class="error-text mt-2" role="alert">{result.error}</p>
				{:else if result && 'success' in result && result.success}
					<p class="muted mt-2">{result.success}</p>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.isAdmin}
		<section class="card mt-6">
			<h2 class="mb-2 font-medium">Add member</h2>
			<p class="muted mb-3">Adds a roommate without a login. Send them an invite link later.</p>
			<form
				method="POST"
				action="?/add"
				class="flex flex-col gap-2 sm:flex-row sm:items-end"
				use:enhance
			>
				<div class="flex-1">
					<label class="label" for="new-name">Name</label>
					<input
						class="input"
						id="new-name"
						name="name"
						required
						maxlength="60"
						value={form?.action === 'add' && form?.values ? form.values.name : ''}
					/>
				</div>
				<button class="btn btn-primary">Add</button>
			</form>
			{#if form?.action === 'add'}
				{#if form.error}
					<p class="error-text mt-2" role="alert">{form.error}</p>
				{:else if form.success}
					<p class="muted mt-2">{form.success}</p>
				{/if}
			{/if}
		</section>
	{:else}
		<p class="muted mt-6">Only admins can add or change members.</p>
	{/if}
</div>
