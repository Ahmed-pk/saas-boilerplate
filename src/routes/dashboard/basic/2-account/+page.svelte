<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const providerNames = { google: 'Google', linkedin: 'LinkedIn' };
	const linkedAccount = (provider) => data.linked.find((a) => a.providerId === provider);

	// 'Mozilla/5.0 (Windows NT 10.0...) ... Chrome/...' -> 'Chrome on Windows'
	function device(ua = '') {
		const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
		const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
		return `${browser} on ${os}`;
	}
	const date = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	let changingEmail = $state(false);
	let deleting = $state(false);
</script>

<!-- Success / error message for one section of the page -->
{#snippet status(section)}
	{#if form?.section === section}
		{#if form.error}<p class="text-sm text-red-600">{form.error}</p>{/if}
		{#if form.success}<p class="text-sm text-secondary">{form.success}</p>{/if}
	{/if}
{/snippet}

<svelte:head><title>Account</title></svelte:head>

<div class="max-w-3xl space-y-6">
	<h1 class="text-2xl font-semibold">Account</h1>

	<!-- Profile -->
	<section class="card">
		<h2 class="font-semibold">Profile</h2>
		<form method="POST" action="?/updateName" use:enhance={() => ({ update }) => update({ reset: false })} class="mt-4 space-y-3">
			<label class="block text-sm">
				<span class="text-gray-700">Name</span>
				<input name="name" value={data.user.name} required autocomplete="name" class="input mt-1" />
			</label>
			{@render status('profile')}
			<button class="btn-primary">Save</button>
		</form>
	</section>

	<!-- Email -->
	<section class="card">
		<h2 class="font-semibold">Email</h2>
		<p class="mt-1 text-sm text-gray-600">{data.user.email}</p>

		{#if form?.section === 'email' && form.pendingEmail}
			<form
				method="POST"
				action="?/confirmEmailChange"
				use:enhance={() => ({ result, update }) => ((changingEmail = result.type !== 'success'), update())}
				class="mt-4 space-y-3"
			>
				<p class="text-sm text-gray-600">Enter the 6-digit code we sent to <b>{form.pendingEmail}</b>.</p>
				<input type="hidden" name="newEmail" value={form.pendingEmail} />
				<input name="otp" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" class="input tracking-widest" />
				{@render status('email')}
				<button class="btn-primary">Confirm new email</button>
			</form>
		{:else if changingEmail}
			<form method="POST" action="?/requestEmailChange" use:enhance class="mt-4 space-y-3">
				<input name="newEmail" type="email" required autocomplete="email" placeholder="New email" class="input" />
				{@render status('email')}
				<div class="flex gap-2">
					<button class="btn-primary">Send code</button>
					<button type="button" onclick={() => (changingEmail = false)} class="btn">Cancel</button>
				</div>
			</form>
		{:else}
			<div class="mt-4 space-y-3">
				{@render status('email')}
				<button onclick={() => (changingEmail = true)} class="btn">Change email</button>
			</div>
		{/if}
	</section>

	<!-- Password -->
	<section class="card">
		<h2 class="font-semibold">Password</h2>
		{#if data.hasPassword}
			<form method="POST" action="?/changePassword" use:enhance class="mt-4 space-y-3">
				<input name="currentPassword" type="password" required autocomplete="current-password" placeholder="Current password" class="input" />
				<input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="New password (8+ characters)" class="input" />
				{@render status('password')}
				<button class="btn-primary">Change password</button>
			</form>
		{:else}
			<p class="mt-1 text-sm text-gray-600">You sign in with an email code or SSO. Add a password to also log in with it.</p>
			<form method="POST" action="?/setPassword" use:enhance class="mt-4 space-y-3">
				<input name="newPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Password (8+ characters)" class="input" />
				{@render status('password')}
				<button class="btn-primary">Set password</button>
			</form>
		{/if}
	</section>

	<!-- Connected accounts (SSO) -->
	<section class="card">
		<h2 class="font-semibold">Connected accounts</h2>
		<p class="mt-1 text-sm text-gray-600">Log in with these instead of your email.</p>
		<ul class="mt-4 divide-y divide-gray-100">
			{#each data.providers as provider (provider)}
				{@const account = linkedAccount(provider)}
				<li class="flex items-center justify-between py-3">
					<div>
						<p class="font-medium">{providerNames[provider]}</p>
						<p class="text-sm text-gray-500">{account ? 'Connected' : 'Not connected'}</p>
					</div>
					{#if account}
						<form method="POST" action="?/unlink" use:enhance>
							<input type="hidden" name="accountId" value={account.id} />
							<button class="btn">Disconnect</button>
						</form>
					{:else}
						<!-- No use:enhance: this redirects to the provider's site -->
						<form method="POST" action="?/link">
							<input type="hidden" name="provider" value={provider} />
							<button class="btn">Connect</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		{@render status('connections')}
	</section>

	<!-- Sessions -->
	<section class="card">
		<div class="flex items-center justify-between gap-3">
			<h2 class="font-semibold">Logged-in devices</h2>
			{#if data.sessions.length > 1}
				<form method="POST" action="?/revokeOtherSessions" use:enhance>
					<button class="btn">Log out other devices</button>
				</form>
			{/if}
		</div>
		<ul class="mt-4 divide-y divide-gray-100">
			{#each data.sessions as s (s.id)}
				<li class="flex items-center justify-between gap-3 py-3">
					<div class="min-w-0">
						<p class="font-medium">
							{device(s.userAgent)}
							{#if s.current}<span class="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">This device</span>{/if}
						</p>
						<p class="truncate text-sm text-gray-500">{s.ipAddress || 'Unknown IP'} · since {date(s.createdAt)}</p>
					</div>
					{#if !s.current}
						<form method="POST" action="?/revokeSession" use:enhance>
							<input type="hidden" name="id" value={s.id} />
							<button class="btn">Log out</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		{@render status('sessions')}
	</section>

	<!-- Delete account -->
	<section class="card border-red-200">
		<h2 class="font-semibold text-red-700">Delete account</h2>
		<p class="mt-1 text-sm text-gray-600">
			Permanently deletes your account and data. An active subscription ends immediately, with no further charges.
		</p>
		{#if deleting}
			<!-- No use:enhance: a full page load after deletion clears everything -->
			<form method="POST" action="?/deleteAccount" class="mt-4 space-y-3">
				{#if data.hasPassword}
					<input name="password" type="password" required autocomplete="current-password" placeholder="Your password" class="input" />
				{/if}
				<input name="confirm" required autocomplete="off" placeholder="Type DELETE to confirm" class="input" />
				{@render status('delete')}
				<div class="flex gap-2">
					<button class="btn-danger">Delete my account</button>
					<button type="button" onclick={() => (deleting = false)} class="btn">Cancel</button>
				</div>
			</form>
		{:else}
			<div class="mt-4 space-y-3">
				{@render status('delete')}
				<button onclick={() => (deleting = true)} class="btn text-red-600">Delete account</button>
			</div>
		{/if}
	</section>
</div>
