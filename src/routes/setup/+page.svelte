<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Set up · PPSplitMeDaddy</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="card w-full max-w-md">
		<h1 class="page-title">Set up your household</h1>
		<p class="muted mb-4">Create the admin account. You can invite the others to log in later.</p>
		<form
			method="POST"
			class="space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<div>
				<label class="label" for="name">Your name</label>
				<input
					class="input"
					id="name"
					name="name"
					required
					maxlength="60"
					autocomplete="name"
					value={form?.values?.name ?? ''}
					aria-invalid={!!form?.errors?.name}
				/>
				{#if form?.errors?.name}<p class="error-text mt-1">{form.errors.name}</p>{/if}
			</div>
			<div>
				<label class="label" for="email">Email</label>
				<input
					class="input"
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					value={form?.values?.email ?? ''}
					aria-invalid={!!form?.errors?.email}
				/>
				{#if form?.errors?.email}<p class="error-text mt-1">{form.errors.email}</p>{/if}
			</div>
			<div>
				<label class="label" for="password">Password</label>
				<input
					class="input"
					id="password"
					name="password"
					type="password"
					required
					minlength="8"
					autocomplete="new-password"
					aria-invalid={!!form?.errors?.password}
				/>
				<p class="muted mt-1">At least 8 characters.</p>
				{#if form?.errors?.password}<p class="error-text mt-1">{form.errors.password}</p>{/if}
			</div>
			<div>
				<label class="label" for="others">Other roommates (optional)</label>
				<textarea
					class="input"
					id="others"
					name="others"
					rows="4"
					placeholder="One name per line"
					value={form?.values?.others ?? ''}
					aria-invalid={!!form?.errors?.others}></textarea>
				{#if form?.errors?.others}<p class="error-text mt-1">{form.errors.others}</p>{/if}
			</div>
			<button class="btn btn-primary w-full" disabled={submitting}>
				{submitting ? 'Creating…' : 'Create household'}
			</button>
		</form>
	</div>
</div>
