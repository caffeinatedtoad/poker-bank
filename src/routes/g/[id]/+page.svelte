<script lang="ts">
	import { formatCents } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// $derived recomputes whenever `data` changes, like a computed field that's never stale.
	let total = $derived(data.players.reduce((sum, p) => sum + p.balanceCents, 0));
</script>

<svelte:head><title>{data.group.name}, Poker Tracker</title></svelte:head>

<h1 class="font-display text-5xl font-extrabold break-words">{data.group.name}</h1>
<p class="mt-1 text-sm opacity-75">Bank: {data.group.bankEmail}</p>

<p class="mt-6 flex items-baseline justify-between gap-4 border-b-2 border-base-content pb-2">
	<span class="text-lg">Owed to the bank</span>
	<span class="font-display text-5xl font-extrabold tabular-nums">{formatCents(total)}</span>
</p>

{#if data.players.length === 0}
	<p class="mt-6 text-lg">No players yet.</p>
{:else}
	<ul class="divide-y divide-base-300">
		{#each data.players as player (player.id)}
			<li class="flex min-h-20 items-center gap-4 py-3">
				<span class="min-w-0 flex-1 truncate font-display text-3xl font-bold">{player.name}</span>
				<span
					class="font-display text-3xl font-bold tabular-nums"
					class:text-primary={player.balanceCents < 0}
				>
					{formatCents(player.balanceCents)}
				</span>
			</li>
		{/each}
	</ul>
{/if}
