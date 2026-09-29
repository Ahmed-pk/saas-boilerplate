<script>
	import AuthForm from '$lib/components/AuthForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Sign up</title></svelte:head>

<h1 class="mb-6 text-xl font-semibold">Create your account</h1>

<AuthForm mode="signup" callbackURL={data.callbackURL} />

<p class="mt-6 text-center text-sm text-gray-600">
	Already have an account? <a href="/login?redirect={encodeURIComponent(data.callbackURL)}" class="link">Log in</a>
</p>
