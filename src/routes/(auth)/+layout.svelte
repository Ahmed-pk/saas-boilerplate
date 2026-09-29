<script>
	let { children } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
	<div class="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		{@render children()}
	</div>
</div>
