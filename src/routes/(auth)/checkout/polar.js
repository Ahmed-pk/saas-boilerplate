import { webhooks } from '@polar-sh/sdk/2026-10';
import { env } from '$env/dynamic/private';
import { polar } from '$lib/server/polar.js';

// Plan slug used in /checkout?plan=... -> Polar product ID.
// Also the plans offered on /dashboard/billing, in this order.
export const plans = {
	monthly: '76385c82-453f-47ee-bcf9-6ec4d74eb0e5',
	basic: '8e4e0569-42d0-4fe9-9cd5-b0d86d8f2274'
};

export async function checkoutUrl(plan, user, origin) {
	const checkout = await polar.checkouts.create({
		products: [plans[plan]],
		// Polar sends this back in webhooks, so payments link to the user without matching emails
		external_customer_id: user.id,
		customer_email: user.email,
		customer_name: user.name,
		success_url: `${origin}/dashboard`,
		return_url: origin
	});
	return checkout.url;
}

// Called by ./webhook/+server.js. save() writes the subscription row.
export async function handleWebhook(request, save) {
	let event;
	try {
		event = await webhooks.validateEvent(await request.text(), Object.fromEntries(request.headers), env.POLAR_WEBHOOK_SECRET);
	} catch (e) {
		if (e instanceof webhooks.PolarWebhookVerificationError) return new Response('Invalid signature', { status: 403 });
		if (e instanceof webhooks.PolarWebhookUnknownTypeError) return new Response(null, { status: 202 });
		throw e;
	}

	// Every subscription.* event carries the full, current subscription
	if (event.type.startsWith('subscription.')) {
		const sub = event.data;
		await save({
			userId: sub.customer.external_id,
			plan: Object.keys(plans).find((slug) => plans[slug] === sub.product_id) ?? sub.product_id,
			status: sub.status,
			periodEnd: sub.current_period_end,
			externalId: sub.id
		});
	}

	return new Response(null, { status: 202 });
}
