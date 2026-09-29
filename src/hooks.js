import { withoutOrder } from '$lib/route-order.js';

// Clean URL -> numbered folder: '/dashboard/account' -> '/dashboard/2-account'
const pages = import.meta.glob('/src/routes/dashboard/**/+page.svelte');
const folders = {};

for (const file of Object.keys(pages)) {
	const path = file.slice('/src/routes'.length, -'/+page.svelte'.length);
	folders[withoutOrder(path)] = path;
}

// Serves /dashboard/account from routes/dashboard/2-account, so URLs stay clean and don't change when pages are reordered
export function reroute({ url }) {
	return folders[url.pathname];
}
