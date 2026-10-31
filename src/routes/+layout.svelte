<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- safe-x / safe-top (layout.css) keep content clear of the notch and rounded corners. -->
<div class="safe-x safe-top mx-auto min-h-dvh max-w-xl pb-12">
	<header class="mb-3 flex min-h-11 items-center justify-between gap-4">
		<a
			href="/"
			class="-mx-2 flex min-h-11 items-center px-2 font-display text-xl font-bold text-primary"
			>Poker Tracker</a
		>
		<span class="min-w-0 truncate text-sm opacity-75">{data.user}</span>
	</header>
	<main>
		{@render children()}
	</main>
</div>
