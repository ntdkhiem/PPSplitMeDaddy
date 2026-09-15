<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { data, children } = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/expenses', label: 'Expenses' },
		{ href: '/payments', label: 'Payments' },
		{ href: '/recurring', label: 'Recurring' },
		{ href: '/import', label: 'Import' },
		{ href: '/settings/members', label: 'Members' }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>PPSplitMeDaddy</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900">
	{#if data.member}
		<header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto flex max-w-4xl items-center gap-4 px-4 py-2">
				<a href="/" class="font-semibold text-emerald-700">PPSplitMeDaddy</a>
				<nav class="flex flex-1 gap-1 overflow-x-auto text-sm">
					{#each links as link (link.href)}
						<a
							href={link.href}
							class="rounded-md px-2.5 py-1.5 whitespace-nowrap {isActive(link.href)
								? 'bg-emerald-50 font-medium text-emerald-700'
								: 'text-slate-600 hover:bg-slate-100'}">{link.label}</a
						>
					{/each}
				</nav>
				<form method="POST" action="/logout" class="shrink-0">
					<span class="mr-2 hidden text-sm text-slate-500 sm:inline">{data.member.name}</span>
					<button class="text-sm text-slate-600 hover:text-slate-900">Log out</button>
				</form>
			</div>
		</header>
	{/if}
	<main>
		{@render children()}
	</main>
</div>
