<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCents } from '#lib/money.ts';
	import type { PageProps } from './$types';

	// `data` is what load() in +page.server.ts returned; `form` is what the last action returned.
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Poker Tracker</title></svelte:head>

<h1 class="font-display text-5xl leading-none font-extrabold">Groups</h1>

{#if data.groups.length === 0}
	<p class="mt-4 text-lg">No groups yet. Create one below and you'll be its bank.</p>
{:else}
	<ul class="mt-4 divide-y divide-base-300 border-y border-base-300">
		{#each data.groups as group (group.id)}
			<li>
				<a
					href="/g/{group.id}"
					class="flex min-h-20 items-center gap-4 py-4 hover:bg-base-200 focus-visible:bg-base-200 active:bg-base-200"
				>
					<span class="min-w-0 flex-1">
						<span class="line-clamp-2 font-display text-3xl leading-tight font-bold break-words">
							{group.name}
						</span>
						<span class="mt-1 block truncate text-sm opacity-75">
							{group.bankEmail === data.user ? "You're the bank" : `Bank: ${group.bankEmail}`},
							{group.playerCount}
							{group.playerCount === 1 ? 'player' : 'players'}
						</span>
					</span>
					<span class="text-right font-display text-3xl font-bold tabular-nums">
						{formatCents(Math.abs(group.totalCents))}
						{#if group.totalCents < 0}<span class="block font-sans text-sm font-normal"
								>bank owes</span
							>{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<!-- use:enhance submits with fetch instead of a full page load. Without JS the form still works. -->
<form method="POST" action="?/create" use:enhance class="mt-10 grid gap-3">
	<h2 class="font-display text-3xl font-bold">Create a group</h2>
	<p class="-mt-2 text-sm opacity-75">
		You'll be its bank: only you can record buy-ins and change balances.
	</p>
	<label class="grid gap-1">
		<span>Name</span>
		<input
			name="name"
			required
			maxlength="40"
			placeholder="Friday poker"
			autocomplete="off"
			autocapitalize="words"
			enterkeyhint="next"
			class="input w-full text-base"
		/>
	</label>
	<label class="grid gap-1">
		<span>Buy-in amount ($)</span>
		<input
			name="defaultBuyin"
			required
			inputmode="decimal"
			enterkeyhint="go"
			autocomplete="off"
			value="20"
			class="input w-full font-display text-xl font-bold tabular-nums"
		/>
	</label>
	{#if form?.error}<p role="alert" class="text-error">{form.error}</p>{/if}
	<button class="btn btn-primary">Create group</button>
</form>
