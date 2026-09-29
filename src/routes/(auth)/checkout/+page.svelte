<script>
	import AuthForm from '$lib/components/AuthForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Checkout</title></svelte:head>

<h1 class="text-xl font-semibold">Get started</h1>
<p class="mt-1 mb-6 text-sm text-gray-600">Verify your email, then you'll go straight to payment.</p>

<AuthForm mode="signup" callbackURL={data.callbackURL} />

<p class="mt-6 text-center text-sm text-gray-600">
	Already have an account? <a href="/login?redirect={encodeURIComponent(data.callbackURL)}" class="link">Log in</a>
</p>
