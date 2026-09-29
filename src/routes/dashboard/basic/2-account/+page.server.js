import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth.js';

// SSO providers offered for linking; must match socialProviders in $lib/server/auth.js
const providers = ['google', 'linkedin'];

export async function load({ request, locals }) {
	const { headers } = request;
	const [accounts, sessions] = await Promise.all([auth.api.listUserAccounts({ headers }), auth.api.listSessions({ headers })]);

	return {
		providers,
		hasPassword: accounts.some((a) => a.providerId === 'credential'),
		linked: accounts.filter((a) => a.providerId !== 'credential').map((a) => ({ id: a.id, providerId: a.providerId })),
		// Session tokens stay on the server; the page only gets IDs
		sessions: sessions
			.map((s) => ({ id: s.id, userAgent: s.userAgent, ipAddress: s.ipAddress, createdAt: s.createdAt, current: s.id === locals.session.id }))
			.sort((a, b) => b.current - a.current || new Date(b.createdAt) - new Date(a.createdAt))
	};
}

// Runs a Better Auth call and reports the result to the section of the page that sent it.
// Only { section, success, ...extra } reaches the browser, never Better Auth's response (it can contain session tokens).
async function run(section, fn, success, extra = {}) {
	try {
		await fn();
		return { section, success, ...extra };
	} catch (e) {
		return fail(400, { section, error: e.body?.message ?? e.message });
	}
}

const field = (form, name) => form.get(name)?.toString().trim() ?? '';

export const actions = {
	updateName: async ({ request }) => {
		const form = await request.formData();
		const name = field(form, 'name');
		if (!name) return fail(400, { section: 'profile', error: 'Name is required.' });
		return run('profile', () => auth.api.updateUser({ body: { name }, headers: request.headers }), 'Name updated.');
	},

	// Step 1: email a code to the new address
	requestEmailChange: async ({ request }) => {
		const newEmail = field(await request.formData(), 'newEmail');
		return run(
			'email',
			() => auth.api.requestEmailChangeEmailOTP({ body: { newEmail }, headers: request.headers }),
			`We sent a code to ${newEmail}.`,
			{ pendingEmail: newEmail }
		);
	},

	// Step 2: confirm the code, then the email changes
	confirmEmailChange: async ({ request }) => {
		const form = await request.formData();
		const newEmail = field(form, 'newEmail');
		const otp = field(form, 'otp');
		const result = await run(
			'email',
			() => auth.api.changeEmailEmailOTP({ body: { newEmail, otp }, headers: request.headers }),
			'Email changed.'
		);
		// Keep the code form visible after a wrong code
		if (result.status === 400) result.data.pendingEmail = newEmail;
		return result;
	},

	changePassword: async ({ request }) => {
		const form = await request.formData();
		return run(
			'password',
			() =>
				auth.api.changePassword({
					body: { currentPassword: field(form, 'currentPassword'), newPassword: field(form, 'newPassword'), revokeOtherSessions: true },
					headers: request.headers
				}),
			'Password changed. Other devices were logged out.'
		);
	},

	// For accounts created with an email code or SSO, which have no password yet
	setPassword: async ({ request }) => {
		const newPassword = field(await request.formData(), 'newPassword');
		return run('password', () => auth.api.setPassword({ body: { newPassword }, headers: request.headers }), 'Password set.');
	},

	link: async ({ request, url }) => {
		const provider = field(await request.formData(), 'provider');
		if (!providers.includes(provider)) return fail(400, { section: 'connections', error: 'Unknown provider.' });

		let providerUrl;
		try {
			// Back to this page after the provider, whichever plan folder it is in
			({ url: providerUrl } = await auth.api.linkSocialAccount({ body: { provider, callbackURL: url.pathname }, headers: request.headers }));
		} catch (e) {
			return fail(400, { section: 'connections', error: e.body?.message ?? e.message });
		}
		redirect(303, providerUrl);
	},

	// Better Auth refuses to remove the last way to log in
	unlink: async ({ request }) => {
		const accountId = field(await request.formData(), 'accountId');
		return run('connections', () => auth.api.unlinkAccount({ body: { accountId }, headers: request.headers }), 'Disconnected.');
	},

	revokeSession: async ({ request }) => {
		const id = field(await request.formData(), 'id');
		const sessions = await auth.api.listSessions({ headers: request.headers });
		const token = sessions.find((s) => s.id === id)?.token;
		if (!token) return fail(400, { section: 'sessions', error: 'Session not found.' });
		return run('sessions', () => auth.api.revokeSession({ body: { token }, headers: request.headers }), 'Device logged out.');
	},

	revokeOtherSessions: ({ request }) =>
		run('sessions', () => auth.api.revokeOtherSessions({ headers: request.headers }), 'All other devices logged out.'),

	// Also ends the Polar subscription (see deleteUser.beforeDelete in $lib/server/auth.js)
	deleteAccount: async ({ request }) => {
		const form = await request.formData();
		if (field(form, 'confirm') !== 'DELETE') return fail(400, { section: 'delete', error: 'Type DELETE to confirm.' });

		const password = field(form, 'password') || undefined;
		try {
			await auth.api.deleteUser({ body: { password }, headers: request.headers });
		} catch (e) {
			// Better Auth errors have a body; anything else came from ending the Polar subscription
			if (!e.body) console.error(e);
			const error =
				e.body?.code === 'SESSION_EXPIRED'
					? 'For your security, log out and log in again, then delete your account.'
					: (e.body?.message ?? "We couldn't end your subscription, so your account was not deleted. Please try again or contact support.");
			return fail(400, { section: 'delete', error });
		}
		redirect(303, '/');
	}
};
