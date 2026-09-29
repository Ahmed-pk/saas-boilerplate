import { db } from '$lib/server/db.js';
import { handleWebhook } from '../polar.js'; // or '../freemius.js'

// Polar identifies the buyer by our user ID, Freemius by email
async function save({ userId = null, email = null, plan, status, periodEnd, externalId }) {
	const [[user]] = await db.execute('SELECT id FROM `user` WHERE id = ? OR email = ? LIMIT 1', [userId, email]);
	if (!user) return;

	await db.execute(
		`INSERT INTO subscription (user_id, plan, status, current_period_end, external_id)
		 VALUES (?, ?, ?, ?, ?) AS new
		 ON DUPLICATE KEY UPDATE
			plan = new.plan,
			status = new.status,
			current_period_end = new.current_period_end,
			external_id = new.external_id`,
		[user.id, plan, status, periodEnd ? new Date(periodEnd) : null, String(externalId)]
	);
}

export const POST = ({ request }) => handleWebhook(request, save);
