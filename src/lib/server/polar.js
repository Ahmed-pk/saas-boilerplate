import { createPolar } from '@polar-sh/sdk/2026-10';
import { env } from '$env/dynamic/private';

// Used by checkout, the billing page and account deletion
export const polar = createPolar({
	accessToken: env.POLAR_ACCESS_TOKEN,
	environment: env.POLAR_SANDBOX === 'true' ? 'sandbox' : 'production'
});
