import { Freemius } from '@freemius/sdk';
import { env } from '$env/dynamic/private';

// Plan slug used in /checkout?plan=... -> Freemius plan ID
export const plans = {
	pro: 'your-freemius-plan-id'
};

// Created on first use: the SDK throws on a missing product ID, and env vars aren't set during `vite build`
let client;
const freemius = () =>
	(client ??= new Freemius({
		productId: Number(env.FREEMIUS_PRODUCT_ID),
		apiKey: env.FREEMIUS_API_KEY,
		secretKey: env.FREEMIUS_SECRET_KEY,
		publicKey: env.FREEMIUS_PUBLIC_KEY
	}));

// Freemius has no per-checkout success URL: set "redirect after purchase" to /dashboard in the Freemius dashboard
export async function checkoutUrl(plan, user) {
	const checkout = await freemius().checkout.create({ planId: plans[plan], isSandbox: env.FREEMIUS_SANDBOX === 'true' });
	// Email is read-only so the webhook can match the purchase back to this user
	return checkout.setUser({ email: user.email, name: user.name }, true).getLink();
}

const licenseEvents = [
	'license.created',
	'license.extended',
	'license.shortened',
	'license.plan.changed',
	'license.updated',
	'license.expired',
	'license.cancelled'
];

// Called by ./webhook/+server.js. save() writes the subscription row.
export function handleWebhook(request, save) {
	const listener = freemius().webhook.createListener();

	listener.on(licenseEvents, async ({ objects: { license } }) => {
		// Re-read the purchase so we always store its current state, whatever the event
		const purchase = await freemius().purchase.retrievePurchase(license.id);
		if (!purchase) return;

		const expired = purchase.expiration && purchase.expiration < new Date();
		await save({
			email: purchase.email, // Freemius only knows the buyer by email
			plan: Object.keys(plans).find((slug) => plans[slug] === purchase.planId) ?? purchase.planId,
			status: purchase.canceled ? 'canceled' : expired ? 'expired' : 'active',
			periodEnd: purchase.expiration,
			externalId: purchase.licenseId
		});
	});

	// Verifies the signature and runs the handler above
	return freemius().webhook.processFetch(listener, request);
}
