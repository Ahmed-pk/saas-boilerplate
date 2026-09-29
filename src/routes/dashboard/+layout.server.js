import { withoutOrder } from '$lib/route-order.js';

// Resolved by Vite at build time, so this also works in production where src/ doesn't exist
const pages = import.meta.glob('./**/+page.svelte');
const iconFiles = import.meta.glob('/static/dashboard-icons/*.{svg,png}');

// './2-account/1-settings/+page.svelte' -> 'account/settings', ordered by the folder numbers
// (numeric sort, so 10- comes after 2-). Unnumbered folders come after numbered ones, alphabetically.
const paths = Object.keys(pages)
	.map((file) => file.slice(2, -'/+page.svelte'.length))
	.filter(Boolean)
	.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
	.map(withoutOrder);

const routes = {};

for (const path of paths) {
	let node = routes;
	for (const segment of path.split('/')) {
		node[segment] ??= {};
		node = node[segment];
	}
}

// '/static/dashboard-icons/account.settings.svg' -> { 'account.settings': '/dashboard-icons/account.settings.svg' }
const icons = {};

for (const file of Object.keys(iconFiles)) {
	const url = file.slice('/static'.length);
	const key = url.slice('/dashboard-icons/'.length).replace(/\.(svg|png)$/, '');
	// .svg wins when a route has both
	if (url.endsWith('.svg') || !icons[key]) icons[key] = url;
}

// hooks.server.js has already checked login and set locals.user, locals.subscription and locals.plan
export function load({ locals }) {
	// The sidebar shows the pages inside the user's plan folder (dashboard/basic/..., dashboard/free/...)
	return {
		routes: routes[locals.plan] ?? {},
		base: `/dashboard/${locals.plan}`,
		icons,
		user: locals.user,
		subscription: locals.subscription
	};
}
