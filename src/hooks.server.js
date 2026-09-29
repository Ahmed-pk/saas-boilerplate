import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth.js';
import { db } from '$lib/server/db.js';
import { withoutOrder } from '$lib/route-order.js';
import { plans } from './routes/(auth)/checkout/polar.js'; // or freemius.js

export async function handle({ event, resolve }) {
	const session = building ? null : await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Guards live here, not in dashboard/+layout.server.js: a layout load doesn't run for form actions or +server.js requests.
	// withoutOrder: '/dashboard/4-basic' must be checked the same as '/dashboard/basic'
	const path = withoutOrder(event.url.pathname);

	if (/^\/dashboard(\/|$)/.test(path)) {
		if (!event.locals.user) redirect(303, `/login?redirect=${encodeURIComponent(event.url.pathname + event.url.search)}`);

		// The user's subscription row (kept in sync by the payment webhook), used by the dashboard layout too
		const [[sub]] = await db.execute('SELECT plan, status, current_period_end FROM subscription WHERE user_id = ?', [event.locals.user.id]);
		event.locals.subscription = sub ?? null;
		// Plan slug the user currently has access to; 'free' without an active subscription.
		// Canceled-at-period-end subscriptions stay 'active' until the period ends
		event.locals.plan = sub && !['canceled', 'expired', 'incomplete_expired'].includes(sub.status) ? sub.plan : 'free';

		// Each plan has its own dashboard folder: routes/dashboard/<plan slug>/... (paid slugs from checkout/polar.js,
		// plus 'free', so 'free' must never be a paid plan's slug). Users only get their own folder; /dashboard redirects to it
		const section = path.split('/')[2];
		const isPlanFolder = Object.hasOwn(plans, section) || section === 'free';
		if (path === '/dashboard' || (isPlanFolder && section !== event.locals.plan)) redirect(303, `/dashboard/${event.locals.plan}`);
	}

	// Everything under /api/auth goes to Better Auth (OTP, SSO callbacks, sign-in/out).
	// Matched by path only: better-auth's svelteKitHandler also compares the origin with BETTER_AUTH_URL,
	// which never matches behind a tunnel (the dev server sees http://, the browser uses https://)
	if (!building && event.url.pathname.startsWith('/api/auth/')) return auth.handler(event.request);

	return resolve(event);
}
