<script>
	import AuthForm from '$lib/components/AuthForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Log in</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold">Log in</h1>

<AuthForm mode="login" callbackURL={data.callbackURL} />

<p class="mt-6 text-center text-sm text-gray-600">
	No account? <a href="/signup?redirect={encodeURIComponent(data.callbackURL)}" class="link">Sign up</a>
</p>
