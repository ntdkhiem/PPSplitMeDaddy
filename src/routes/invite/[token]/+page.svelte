<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Accept invite · PPSplitMeDaddy</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 py-10">
	<div class="card w-full max-w-sm">
		{#if !data.invite}
			<h1 class="page-title">Invite not valid</h1>
			<p class="muted mb-4">
				This invite link is invalid, has expired, or was already used. Ask your household admin for
				a new link.
			</p>
			<a class="btn btn-secondary w-full" href="/login">Go to login</a>
		{:else}
			<h1 class="page-title">Hi, {data.invite.name}!</h1>
			<p class="muted mb-4">
				{data.invite.hasLogin
					? 'Choose a new password for your account.'
					: 'Set up your login for PPSplitMeDaddy.'}
			</p>
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
						autocomplete="email"
						value={form?.values?.email ?? data.invite.email ?? ''}
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
					<label class="label" for="confirm">Confirm password</label>
					<input
						class="input"
						id="confirm"
						name="confirm"
						type="password"
						required
						autocomplete="new-password"
						aria-invalid={!!form?.errors?.confirm}
					/>
					{#if form?.errors?.confirm}<p class="error-text mt-1">{form.errors.confirm}</p>{/if}
				</div>
				{#if form?.errors?.form}<p class="error-text" role="alert">{form.errors.form}</p>{/if}
				<button class="btn btn-primary w-full" disabled={submitting}>
					{submitting ? 'Saving…' : 'Save and log in'}
				</button>
			</form>
		{/if}
	</div>
</div>
