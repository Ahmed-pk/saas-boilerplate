<!--
	Used by login, signup and checkout.
	mode: 'login' | 'signup'   (signup asks for a name)
	callbackURL: where to go once signed in
-->
<script>
	import { authClient } from '$lib/auth-client.js';

	let { mode, callbackURL } = $props();

	let method = $state('code'); // 'code' | 'password'
	let step = $state('form'); // 'form' | 'otp'
	let otpType = $state('sign-in'); // 'sign-in' (code login) | 'email-verification' (after password sign-up)

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let otp = $state('');

	let error = $state('');
	let loading = $state(false);

	// Full page load so the new session cookie is sent (and /checkout can redirect to payment)
	const done = () => location.assign(callbackURL);

	async function run(fn) {
		error = '';
		loading = true;
		try {
			await fn();
		} finally {
			loading = false;
		}
	}

	function showOtp(type) {
		otpType = type;
		step = 'otp';
	}

	const submitForm = () =>
		run(async () => {
			if (method === 'code') {
				const { error: e } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
				if (e) return (error = e.message);
				return showOtp('sign-in');
			}

			// Password accounts must verify their email before they get a session.
			// In both cases below Better Auth has already emailed the code.
			if (mode === 'signup') {
				const { error: e } = await authClient.signUp.email({ name, email, password });
				if (e) return (error = e.message);
				return showOtp('email-verification');
			}

			const { error: e } = await authClient.signIn.email({ email, password });
			if (e?.code === 'EMAIL_NOT_VERIFIED') return showOtp('email-verification');
			if (e) return (error = e.message);
			done();
		});

	const submitOtp = () =>
		run(async () => {
			const { error: e } =
				otpType === 'sign-in'
					? await authClient.signIn.emailOtp({ email, otp, ...(mode === 'signup' && { name }) })
					: await authClient.emailOtp.verifyEmail({ email, otp });
			if (e) return (error = e.message);
			done();
		});

	const social = (provider) => run(() => authClient.signIn.social({ provider, callbackURL }));
</script>

{#if step === 'otp'}
	<form onsubmit={(e) => (e.preventDefault(), submitOtp())} class="space-y-3">
		<p class="text-sm text-gray-600">We sent a 6-digit code to <b>{email}</b>.</p>
		<input bind:value={otp} required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" class="input tracking-widest" />
		{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
		<button disabled={loading} class="btn-primary w-full">Verify</button>
		<button type="button" onclick={() => ((step = 'form'), (otp = ''), (error = ''))} class="w-full text-sm text-gray-500 hover:underline">
			Use a different email
		</button>
	</form>
{:else}
	<div class="space-y-2">
		<button type="button" disabled={loading} onclick={() => social('google')} class="btn w-full">Continue with Google</button>
		<button type="button" disabled={loading} onclick={() => social('linkedin')} class="btn w-full">Continue with LinkedIn</button>
	</div>

	<p class="my-4 text-center text-xs text-gray-400">or</p>

	<form onsubmit={(e) => (e.preventDefault(), submitForm())} class="space-y-3">
		{#if mode === 'signup'}
			<input bind:value={name} required autocomplete="name" placeholder="Name" class="input" />
		{/if}
		<input bind:value={email} required type="email" autocomplete="email" placeholder="Email" class="input" />
		{#if method === 'password'}
			<input
				bind:value={password}
				required
				type="password"
				minlength="8"
				autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
				placeholder="Password"
				class="input"
			/>
		{/if}
		{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
		<button disabled={loading} class="btn-primary w-full">
			{method === 'code' ? 'Email me a code' : mode === 'signup' ? 'Sign up' : 'Log in'}
		</button>
		<button type="button" onclick={() => ((method = method === 'code' ? 'password' : 'code'), (error = ''))} class="w-full text-sm text-gray-500 hover:underline">
			{method === 'code' ? 'Use a password instead' : 'Use an email code instead'}
		</button>
	</form>
{/if}

