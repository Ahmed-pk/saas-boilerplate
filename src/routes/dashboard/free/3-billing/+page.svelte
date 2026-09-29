<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const sub = $derived(data.subscription);
	const active = $derived(sub && sub.status !== 'canceled');
	const planName = (productId) => data.plans.find((p) => p.productId === productId)?.name ?? 'another plan';

	const money = (cents, currency) =>
		new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
	const date = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'long' });
	const reasonLabel = (r) => r.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

	let confirmingCancel = $state(false);
</script>

<svelte:head><title>Billing</title></svelte:head>

<div class="max-w-3xl space-y-6">
	<h1 class="text-2xl font-semibold">Billing</h1>

	{#if form?.error}<p class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{form.error}</p>{/if}
	{#if form?.success}<p class="rounded-md bg-secondary-soft px-4 py-3 text-sm text-secondary">{form.success}</p>{/if}

	<!-- Current plan -->
	<section class="card">
		<h2 class="font-semibold">Current plan</h2>
		{#if active}
			<div class="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<p class="text-xl font-semibold">{sub.name}</p>
				<p class="text-gray-600">{money(sub.amount, sub.currency)} / {sub.interval}</p>
				<span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary capitalize">{sub.status.replaceAll('_', ' ')}</span>
			</div>
			<p class="mt-2 text-sm text-gray-600">
				{#if sub.cancelAtPeriodEnd}
					Canceled. Access ends on <b>{date(sub.periodEnd)}</b>.
				{:else}
					Renews on {date(sub.periodEnd)}.
				{/if}
			</p>

			{#if sub.pending}
				<form method="POST" action="?/keepPlan" use:enhance class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-gray-50 px-4 py-3 text-sm">
					<span>Switching to <b>{planName(sub.pending.productId)}</b> on {date(sub.pending.appliesAt)}.</span>
					<button class="btn">Keep {sub.name}</button>
				</form>
			{/if}

			{#if sub.cancelAtPeriodEnd}
				<form method="POST" action="?/resume" use:enhance class="mt-4">
					<button class="btn-primary">Resume subscription</button>
				</form>
			{/if}
		{:else}
			<p class="mt-2 text-sm text-gray-600">You're on the free plan. Pick a plan below to upgrade.</p>
		{/if}
	</section>

	<!-- Plans: upgrade / downgrade, or subscribe -->
	<section class="card">
		<h2 class="font-semibold">Plans</h2>
		{#if active}
			<p class="mt-1 text-sm text-gray-600">Upgrades apply now and you pay the difference. Downgrades apply when your current period ends.</p>
		{/if}
		<ul class="mt-4 grid gap-3 sm:grid-cols-2">
			{#each data.plans as plan (plan.slug)}
				{@const current = active && sub.productId === plan.productId}
				<li class="flex flex-col rounded-lg border p-4 {current ? 'border-primary bg-primary-soft' : 'border-gray-200'}">
					<p class="font-medium">{plan.name}</p>
					<p class="mt-1 text-sm text-gray-600">
						{plan.price ? `${money(plan.price.amount, plan.price.currency)} / ${plan.interval}` : 'Custom pricing'}
					</p>
					<div class="mt-4">
						{#if current}
							<span class="text-sm font-medium text-primary">Current plan</span>
						{:else if active}
							<form method="POST" action="?/changePlan" use:enhance>
								<input type="hidden" name="plan" value={plan.slug} />
								<button class="btn">Switch to {plan.name}</button>
							</form>
						{:else}
							<a href="/checkout?plan={plan.slug}" class="btn-primary">Subscribe</a>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	{#if active}
		<!-- Payment method, invoices: Polar's hosted customer portal -->
		<section class="card">
			<h2 class="font-semibold">Payment method & invoices</h2>
			<p class="mt-1 text-sm text-gray-600">Update your card, billing address or tax ID, and download invoices.</p>
			<form method="POST" action="?/portal" class="mt-4">
				<button class="btn">Open billing portal</button>
			</form>
		</section>

		{#if !sub.cancelAtPeriodEnd}
			<section class="card border-red-200">
				<h2 class="font-semibold">Cancel subscription</h2>
				<p class="mt-1 text-sm text-gray-600">You keep access until {date(sub.periodEnd)}. You can resume any time before then.</p>

				{#if confirmingCancel}
					<form method="POST" action="?/cancel" use:enhance={() => async ({ update }) => ((confirmingCancel = false), update())} class="mt-4 space-y-3">
						<select name="reason" class="input">
							<option value="">Why are you canceling? (optional)</option>
							{#each data.cancelReasons as reason (reason)}
								<option value={reason}>{reasonLabel(reason)}</option>
							{/each}
						</select>
						<textarea name="comment" rows="3" maxlength="1000" placeholder="Anything we could do better? (optional)" class="input"></textarea>
						<div class="flex gap-2">
							<button class="btn-danger">Cancel subscription</button>
							<button type="button" onclick={() => (confirmingCancel = false)} class="btn">Keep it</button>
						</div>
					</form>
				{:else}
					<button onclick={() => (confirmingCancel = true)} class="btn mt-4 text-red-600">Cancel subscription</button>
				{/if}
			</section>
		{/if}
	{/if}
</div>
