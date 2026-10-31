<script lang="ts">
	import { formatCents } from '#lib/money.ts';
	import type { PageProps } from './$types';

	// `data` is what load() in +page.server.ts returned, fully typed.
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Poker Tracker</title></svelte:head>

<h1 class="font-display text-5xl font-extrabold">Games</h1>

{#if data.groups.length === 0}
	<p class="mt-4 text-lg">No games yet. Start one below and you'll be its bank.</p>
{:else}
	<ul class="mt-4 divide-y divide-base-300 border-y border-base-300">
		{#each data.groups as group (group.id)}
			<li>
				<a
					href="/g/{group.id}"
					class="flex items-baseline gap-4 py-4 hover:bg-base-200 focus-visible:bg-base-200"
				>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-display text-3xl font-bold">{group.name}</span>
						<span class="block truncate text-sm opacity-75">
							Bank: {group.bankEmail}, {group.playerCount}
							{group.playerCount === 1 ? 'player' : 'players'}
						</span>
					</span>
					<span class="font-display text-3xl font-bold tabular-nums">
						{formatCents(group.totalCents)}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}
