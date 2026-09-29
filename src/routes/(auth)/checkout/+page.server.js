import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db.js';
import { plans, checkoutUrl } from './polar.js'; // or './freemius.js'

// Linked from the marketing site as /checkout?plan=pro
export async function load({ locals, url }) {
	const plan = url.searchParams.get('plan');
	if (!plan || !Object.hasOwn(plans, plan)) error(404, 'Unknown plan');

	if (locals.user) {
		// Already subscribed: a second checkout would create a second subscription. Plan changes happen on /dashboard/billing
		const [[sub]] = await db.execute('SELECT status FROM subscription WHERE user_id = ?', [locals.user.id]);
		if (sub && !['canceled', 'expired', 'incomplete_expired'].includes(sub.status)) redirect(303, '/dashboard');

		// Signed in (or just came back from signing in): straight to payment.
		// BETTER_AUTH_URL, not url.origin: behind a tunnel url.origin is http:// while the site is https://
		redirect(303, await checkoutUrl(plan, locals.user, env.BETTER_AUTH_URL));
	}

	return { plan, callbackURL: `/checkout?plan=${plan}` };
}
