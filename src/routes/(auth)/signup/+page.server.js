import { redirect } from '@sveltejs/kit';

export function load({ locals, url }) {
	// Only same-site paths: '/x' yes, '//evil.com' and '/\evil.com' no
	const next = url.searchParams.get('redirect');
	const callbackURL = next && /^\/(?![/\\])/.test(next) ? next : '/dashboard';

	if (locals.user) redirect(303, callbackURL);

	return { callbackURL };
}
