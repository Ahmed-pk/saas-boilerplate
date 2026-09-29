<!-- Dashboard home for signed-up users without an active subscription (hooks.server.js sends them to dashboard/free) -->
<script>
	let { data } = $props();
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<div class="max-w-xl">
	<h1 class="text-2xl font-semibold">Welcome, {data.user.name}</h1>
	<p class="mt-2 text-gray-600">You're on the free plan. Subscribe to unlock everything.</p>
	<a href="{data.base}/billing" class="btn-primary mt-6">See plans</a>
</div>
