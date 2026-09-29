import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import nodemailer from 'nodemailer';
import { db } from './db.js';
import { polar } from './polar.js';

const mailer = nodemailer.createTransport({
	host: env.SMTP_HOST,
	port: Number(env.SMTP_PORT),
	secure: env.SMTP_PORT === '465',
	auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
});


const subjects = {
	'sign-in': 'Your sign-in code',
	'email-verification': 'Verify your email',
	'forget-password': 'Reset your password',
	'change-email': 'Confirm your new email'
};

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: db,
	
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true
	},
	emailVerification: {
		// Unverified password users get a fresh code when they try to log in
		sendOnSignIn: true,
		autoSignInAfterVerification: true
	},

	socialProviders: {
		google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
		linkedin: { clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET }
	},

	user: {
		deleteUser: {
			enabled: true,
			// Runs after the password / recent-login check passes, before anything is deleted.
			// Ends the Polar subscription now so a deleted account is never charged again.
			// If Polar fails, this throws and the account is kept.
			async beforeDelete(user) {
				const [[sub]] = await db.execute('SELECT external_id, status FROM subscription WHERE user_id = ?', [user.id]);
				if (sub && sub.status !== 'canceled') await polar.subscriptions.revoke(sub.external_id);
			}
		}
	},

	plugins: [
		emailOTP({
			// Password sign-ups verify with a 6-digit code too, instead of a link
			overrideDefaultEmailVerification: true,
			// Account page: a code is sent to the new address before the email changes
			changeEmail: { enabled: true },
			async sendVerificationOTP({ email, otp, type }) {
				// Not awaited, so response time doesn't reveal whether the email exists
				mailer.sendMail({
						from: env.SMTP_FROM,
						to: email,
						subject: subjects[type],
						text: `Your code is ${otp}\n\nIt expires in 5 minutes.`
					}).catch(console.error);
			}
		}),
		// Must stay last: lets auth.api calls in server code set cookies
		sveltekitCookies(getRequestEvent)
	]
});
