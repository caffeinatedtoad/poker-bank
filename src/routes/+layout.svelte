<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="mx-auto min-h-dvh max-w-xl px-4 pt-4 pb-12">
	<header class="mb-6 flex items-center justify-between gap-4">
		<a href="/" class="font-display text-xl font-bold text-primary">Poker Tracker</a>
	</header>
	<main>
		{@render children()}
	</main>
</div>
