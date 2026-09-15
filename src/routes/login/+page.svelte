<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Log in · PPSplitMeDaddy</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="card w-full max-w-sm">
		<h1 class="page-title">PPSplitMeDaddy</h1>
		<p class="muted mb-4">Log in to your household.</p>
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
				<label class="label" for="email">Email</label>
				<input
					class="input"
					id="email"
					name="email"
					type="email"
					required
					autocomplete="username"
					value={form?.values?.email ?? ''}
				/>
			</div>
			<div>
				<label class="label" for="password">Password</label>
				<input
					class="input"
					id="password"
					name="password"
					type="password"
					required
					autocomplete="current-password"
				/>
			</div>
			{#if form?.error}<p class="error-text" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary w-full" disabled={submitting}>
				{submitting ? 'Logging in…' : 'Log in'}
			</button>
		</form>
		<p class="muted mt-4">No password yet? Ask your household admin for an invite link.</p>
	</div>
</div>
