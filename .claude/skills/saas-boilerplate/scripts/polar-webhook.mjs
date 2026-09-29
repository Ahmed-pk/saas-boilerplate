// Sends a signed Polar `subscription.updated` webhook to a local server, so the webhook -> subscription table
// path can be tested without a real payment.
//
//   node --env-file=.env .claude/skills/saas-boilerplate/scripts/polar-webhook.mjs <userId> [status] [productId]
//
// status:    active (default) | trialing | past_due | canceled | ...
// productId: use one from `plans` to see its slug stored; defaults to a random UUID (stored as-is)
// Env:       POLAR_WEBHOOK_SECRET (required, same value the server uses)
//            WEBHOOK_URL (default http://localhost:5173/checkout/webhook)
//            BAD_SIGNATURE=1 to check that a wrong signature is rejected (expect 403)
import { createHmac, randomUUID } from 'node:crypto';

const [userId, status = 'active', productId = randomUUID()] = process.argv.slice(2);
const secret = process.env.POLAR_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL ?? 'http://localhost:5173/checkout/webhook';

if (!userId || !secret) {
	console.error('Usage: node --env-file=.env polar-webhook.mjs <userId> [status] [productId]  (needs POLAR_WEBHOOK_SECRET)');
	process.exit(1);
}

const now = new Date().toISOString();
const periodEnd = new Date(Date.now() + 30 * 864e5).toISOString();

// Every field the SDK's validateEvent requires for a subscription payload
const body = JSON.stringify({
	type: 'subscription.updated',
	timestamp: now,
	data: {
		id: randomUUID(),
		created_at: now,
		modified_at: now,
		amount: 1000,
		currency: 'usd',
		recurring_interval: 'month',
		recurring_interval_count: 1,
		status,
		current_period_start: now,
		current_period_end: periodEnd,
		current_meter_period_start: null,
		current_meter_period_end: null,
		trial_start: null,
		trial_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
		started_at: now,
		ends_at: null,
		ended_at: null,
		pause_at_period_end: false,
		paused_at: null,
		resumes_at: null,
		customer_id: randomUUID(),
		product_id: productId,
		discount_id: null,
		checkout_id: null,
		units: null,
		customer_cancellation_reason: null,
		customer_cancellation_comment: null,
		metadata: {},
		customer: {
			id: randomUUID(),
			created_at: now,
			modified_at: null,
			metadata: {},
			external_id: userId,
			email: 'test@example.com',
			email_verified: true,
			type: 'individual',
			name: 'Test',
			billing_name: null,
			billing_address: null,
			tax_id: null,
			organization_id: randomUUID()
		},
		product: {},
		discount: null,
		prices: [],
		meters: [],
		pending_update: null
	}
});

// Standard Webhooks signature: base64(HMAC-SHA256(key, "id.timestamp.body")), key = base64-decoded secret after "whsec_"
const id = `msg_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();
const key = process.env.BAD_SIGNATURE ? Buffer.from('wrong') : Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

const res = await fetch(url, {
	method: 'POST',
	headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` },
	body
});
console.log(res.status, await res.text());
