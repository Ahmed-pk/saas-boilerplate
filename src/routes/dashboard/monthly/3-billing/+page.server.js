import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db.js';
import { polar } from '$lib/server/polar.js';
import { plans } from '../../../(auth)/checkout/polar.js';

const cancelReasons = ['too_expensive', 'missing_features', 'switched_service', 'unused', 'too_complex', 'low_quality', 'customer_service', 'other'];

// The user's Polar subscription ID, from the row the webhook keeps in sync.
// Actions always look it up server-side, never trust an ID sent by the form.
async function subscriptionId(userId) {
	const [[row]] = await db.execute('SELECT external_id, status FROM subscription WHERE user_id = ?', [userId]);
	return row && row.status !== 'canceled' ? row.external_id : null;
}

// First active fixed price of a product, in cents
function fixedPrice(product) {
	const price = product.prices.find((p) => p.amount_type === 'fixed' && !p.is_archived);
	return price ? { amount: price.price_amount, currency: price.price_currency } : null;
}

export async function load({ locals }) {
	const id = await subscriptionId(locals.user.id);

	// Read live from Polar, not the DB row, so changes show immediately instead of after the webhook
	const [sub, offered] = await Promise.all([
		id ? polar.subscriptions.get(id) : null,
		Promise.all(
			Object.entries(plans).map(async ([slug, productId]) => {
				try {
					const product = await polar.products.get(productId);
					return { slug, productId, name: product.name, interval: product.recurring_interval, price: fixedPrice(product) };
				} catch (e) {
					// Usually a product ID from the other Polar environment (sandbox vs production): skip it, don't break the page
					console.error(`Billing: Polar product for plan "${slug}" (${productId}) could not be loaded:`, e.message);
					return null;
				}
			})
		)
	]);

	return {
		plans: offered.filter(Boolean),
		cancelReasons,
		subscription: sub && {
			productId: sub.product_id,
			name: sub.product.name,
			status: sub.status,
			amount: sub.amount,
			currency: sub.currency,
			interval: sub.recurring_interval,
			periodEnd: sub.current_period_end,
			cancelAtPeriodEnd: sub.cancel_at_period_end,
			// A downgrade waiting for the end of the paid period
			pending: sub.pending_update?.product_id
				? { productId: sub.pending_update.product_id, appliesAt: sub.pending_update.applies_at }
				: null
		}
	};
}

async function update(locals, body, success) {
	const id = await subscriptionId(locals.user.id);
	if (!id) return fail(400, { error: 'You have no active subscription.' });
	try {
		await polar.subscriptions.update(id, body);
		return { success };
	} catch (e) {
		console.error(e);
		return fail(400, { error: 'Polar rejected the change. Please try again or contact support.' });
	}
}

export const actions = {
	changePlan: async ({ request, locals }) => {
		const slug = (await request.formData()).get('plan');
		if (!Object.hasOwn(plans, slug)) return fail(400, { error: 'Unknown plan.' });

		const id = await subscriptionId(locals.user.id);
		if (!id) return fail(400, { error: 'You have no active subscription.' });
		const [current, next] = await Promise.all([polar.subscriptions.get(id), polar.products.get(plans[slug])]);
		if (current.product_id === plans[slug]) return fail(400, { error: `You're already on ${next.name}.` });
		const upgrade = (fixedPrice(next)?.amount ?? 0) >= current.amount;

		return update(
			locals,
			{
				product_id: plans[slug],
				// Upgrade: switch now and charge the prorated difference.
				// Downgrade: keep the current plan until the paid period ends, then switch.
				proration_behavior: upgrade ? 'invoice' : 'next_period'
			},
			upgrade ? `Switched to ${next.name}.` : `You'll switch to ${next.name} at the end of this billing period.`
		);
	},

	// Undo a scheduled downgrade
	keepPlan: ({ locals }) => update(locals, { pending_update: null }, 'Scheduled plan change removed.'),

	cancel: async ({ request, locals }) => {
		const form = await request.formData();
		const reason = form.get('reason');
		return update(
			locals,
			{
				cancel_at_period_end: true,
				customer_cancellation_reason: cancelReasons.includes(reason) ? reason : null,
				customer_cancellation_comment: form.get('comment')?.toString().slice(0, 1000) || null
			},
			'Subscription canceled. You keep access until the end of the billing period.'
		);
	},

	resume: ({ locals }) => update(locals, { cancel_at_period_end: false }, 'Subscription resumed.'),

	// Polar's hosted portal: payment method, billing address, tax ID, invoices
	portal: async ({ locals, url }) => {
		let portalUrl;
		try {
			const session = await polar.customerSessions.create({
				external_customer_id: locals.user.id,
				return_url: `${env.BETTER_AUTH_URL}${url.pathname}` // back to this page, whichever plan folder it is in
			});
			portalUrl = session.customer_portal_url;
		} catch (e) {
			console.error(e);
			return fail(400, { error: 'Could not open the billing portal. Please try again.' });
		}
		redirect(303, portalUrl);
	}
};
