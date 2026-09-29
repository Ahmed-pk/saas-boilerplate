<script>
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client.js';

	let { data, children } = $props();

	const label = (segment) => segment.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

	async function logout() {
		await authClient.signOut();
		location.assign('/login');
	}
</script>

{#snippet tree(nodes, parent)}
	<ul class={parent === data.base ? 'space-y-1' : 'mt-1 ml-3 space-y-1 border-l border-gray-200 pl-2'}>
		{#each Object.entries(nodes) as [segment, sub] (segment)}
			{@const href = `${parent}/${segment}`}
			{@const active = page.url.pathname === href}
			<!-- '/dashboard/basic/account/settings' -> 'account.settings': both plans share the same icons -->
			{@const icon = data.icons[href.slice(data.base.length + 1).replaceAll('/', '.')]}
			<li>
				<a {href} aria-current={active ? 'page' : undefined} class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm {active ? 'bg-primary font-medium text-primary-fg' : 'text-gray-700 hover:bg-gray-200'}">
					{#if icon}<img src={icon} alt="" class="size-4 shrink-0" class:invert={active} />{/if}
					{label(segment)}
				</a>
				{#if Object.keys(sub).length}
					{@render tree(sub, href)}
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<div class="flex">
	<aside class="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-gray-50 p-4 h-screen">
		<a href={data.base} class="mb-4 block px-3 text-lg font-semibold">Dashboard</a>
		<nav class="flex-1">
			{@render tree(data.routes, data.base)}
		</nav>

		<div class="border-t border-gray-200 px-3 pt-4 text-sm">
			<p class="truncate font-medium">{data.user.name}</p>
			<p class="truncate text-gray-500">{data.user.email}</p>
			<p class="mt-1 text-gray-500">
				{data.subscription ? `${label(data.subscription.plan)} · ${data.subscription.status}` : 'Free'}
			</p>
			<button onclick={logout} class="mt-3 text-gray-700 hover:underline">Log out</button>
		</div>
	</aside>

	<main class="flex-1 p-8 overflow-auto max-h-screen">
		{@render children()}
	</main>
</div>
