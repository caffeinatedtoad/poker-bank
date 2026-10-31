<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { formatCents, parseCents, toInputValue } from '#lib/money.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { PageProps } from './$types';

	// `data` merges this page's load() with the layout's (which adds `user`).
	let { data, form }: PageProps = $props();

	// $derived recomputes whenever `data` changes, like a computed field that's never stale.
	let total = $derived(data.players.reduce((sum, p) => sum + p.balanceCents, 0));
	let isBank = $derived(data.user === data.group.bankEmail);

	// $state is a variable the template watches: assigning to it re-renders what uses it.
	// The buy-in amount starts at the group default and the bank can change it for tonight.
	// Copying the initial value only is intended, so a background refresh never overwrites what they typed.
	// svelte-ignore state_referenced_locally
	let amount = $state(toInputValue(data.group.defaultBuyinCents));
	let amountCents = $derived(parseCents(amount));
	let amountValid = $derived(amountCents !== null && amountCents > 0);

	// Which row's extra actions are showing, and which confirmation is open (if any).
	let expanded = $state<number | null>(null);
	let pending = $state<{ kind: 'clear' | 'set' | 'remove'; playerId: number } | null>(null);
	let pendingPlayer = $derived(data.players.find((p) => p.id === pending?.playerId));
	let setValue = $state('');
	let setCents = $derived(parseCents(setValue));

	// Poll for other people's changes: re-run load() every 5s while the tab is visible.
	// $effect runs in the browser only; the function it returns is cleanup, like a deferred ticker.Stop().
	$effect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) refreshAll();
		}, 5000);
		return () => clearInterval(timer);
	});

	function confirm(kind: 'clear' | 'set' | 'remove', player: { id: number; balanceCents: number }) {
		setValue = toInputValue(player.balanceCents);
		expanded = null;
		pending = { kind, playerId: player.id };
	}
</script>

<svelte:head><title>{data.group.name}, Poker Tracker</title></svelte:head>

<h1 class="font-display text-5xl font-extrabold break-words">{data.group.name}</h1>
<p class="mt-1 text-sm opacity-75">
	{isBank ? 'You are the bank.' : `Bank: ${data.group.bankEmail}`}
</p>

<p class="mt-6 flex items-baseline justify-between gap-4 border-b-2 border-base-content pb-2">
	<span class="text-lg">Owed to the bank</span>
	<span class="font-display text-5xl font-extrabold tabular-nums">{formatCents(total)}</span>
</p>

{#if form?.error}
	<p role="alert" class="mt-4 rounded-box bg-error px-4 py-3 text-error-content">{form.error}</p>
{/if}

{#if isBank && data.players.length > 0}
	<div class="mt-4 flex flex-wrap items-end gap-3">
		<label class="grid gap-1">
			<span class="text-sm">Buy-in amount ($)</span>
			<input
				bind:value={amount}
				inputmode="decimal"
				aria-invalid={!amountValid}
				class="input w-32 font-display text-xl font-bold tabular-nums"
			/>
		</label>
		{#if amountValid && amountCents !== data.group.defaultBuyinCents}
			<form method="POST" action="?/setDefault" use:enhance>
				<input type="hidden" name="amount" value={amount} />
				<button class="btn btn-ghost btn-sm">Make {formatCents(amountCents!)} the default</button>
			</form>
		{/if}
	</div>
{/if}

{#if data.players.length === 0}
	<p class="mt-6 text-lg">
		{isBank ? 'No players yet. Add the first one below.' : 'No players yet.'}
	</p>
{:else}
	<ul class="mt-2 divide-y divide-base-300">
		{#each data.players as player (player.id)}
			<li class="py-3">
				<div class="flex min-h-20 items-center gap-3">
					<div class="min-w-0 flex-1">
						<p class="truncate font-display text-3xl font-bold">{player.name}</p>
						<p
							class="font-display text-2xl font-semibold tabular-nums"
							class:text-primary={player.balanceCents < 0}
						>
							{formatCents(player.balanceCents)}
							{#if player.balanceCents < 0}<span class="font-sans text-sm font-normal">
									bank owes</span
								>{/if}
						</p>
					</div>

					{#if isBank}
						<form method="POST" action="?/buyin" use:enhance>
							<input type="hidden" name="playerId" value={player.id} />
							<input type="hidden" name="amount" value={amount} />
							<button
								class="chip"
								class:text-base={amount.length > 4}
								disabled={!amountValid}
								aria-label="Buy in {player.name} for {amountValid
									? formatCents(amountCents!)
									: 'an invalid amount'}"
							>
								{amountValid ? `+${formatCents(amountCents!)}` : '?'}
							</button>
						</form>
						<button
							class="btn btn-square btn-ghost"
							aria-expanded={expanded === player.id}
							aria-label="More for {player.name}"
							onclick={() => (expanded = expanded === player.id ? null : player.id)}
						>
							<svg viewBox="0 0 24 24" class="size-6" fill="currentColor" aria-hidden="true">
								<circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle
									cx="19"
									cy="12"
									r="2"
								/>
							</svg>
						</button>
					{/if}
				</div>

				{#if isBank && expanded === player.id}
					<div class="flex flex-wrap gap-2 pb-1">
						<button class="btn btn-sm" onclick={() => confirm('set', player)}>Set amount</button>
						<button
							class="btn btn-sm"
							disabled={player.balanceCents === 0}
							onclick={() => confirm('clear', player)}>Clear to $0</button
						>
						<button
							class="btn btn-ghost text-error btn-sm"
							onclick={() => confirm('remove', player)}>Remove player</button
						>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if isBank}
	<form method="POST" action="?/addPlayer" use:enhance class="mt-6 flex items-end gap-2">
		<label class="grid flex-1 gap-1">
			<span class="text-sm">New player</span>
			<input name="name" required maxlength="40" placeholder="Name" class="input w-full" />
		</label>
		<button class="btn btn-primary">Add player</button>
	</form>
{/if}

<!-- One dialog, mounted only while a confirmation is pending. -->
{#if pending && pendingPlayer}
	{@const p = pendingPlayer}
	{#if pending.kind === 'clear'}
		<ConfirmDialog
			title="Clear {p.name}?"
			action="?/clear"
			confirmLabel="Clear to $0"
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<p class="text-lg">
				{p.name} goes from <strong class="tabular-nums">{formatCents(p.balanceCents)}</strong> to
				<strong>$0</strong>. Their buy-in history is kept.
			</p>
		</ConfirmDialog>
	{:else if pending.kind === 'set'}
		<ConfirmDialog
			title="Set {p.name}'s amount"
			action="?/set"
			confirmLabel={setCents === null ? 'Set amount' : `Set to ${formatCents(setCents)}`}
			disabled={setCents === null || setCents === p.balanceCents}
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<label class="grid gap-1">
				<span>New amount owed ($). Use a minus sign if the bank owes them.</span>
				<input
					name="value"
					bind:value={setValue}
					inputmode="decimal"
					class="input w-full font-display text-2xl font-bold tabular-nums"
				/>
			</label>
			<p class="text-lg">
				{#if setCents === null}
					Enter an amount like 40 or -12.50.
				{:else}
					{p.name} goes from <strong class="tabular-nums">{formatCents(p.balanceCents)}</strong> to
					<strong class="tabular-nums">{formatCents(setCents)}</strong>.
				{/if}
			</p>
		</ConfirmDialog>
	{:else}
		<ConfirmDialog
			title="Remove {p.name}?"
			action="?/removePlayer"
			confirmLabel="Remove {p.name}"
			danger
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<p class="text-lg">
				{#if p.balanceCents > 0}
					{p.name} still owes <strong class="tabular-nums">{formatCents(p.balanceCents)}</strong>.
				{:else if p.balanceCents < 0}
					The bank still owes {p.name}
					<strong class="tabular-nums">{formatCents(-p.balanceCents)}</strong>.
				{/if}
				Removing them deletes their buy-in history. This can't be undone.
			</p>
		</ConfirmDialog>
	{/if}
{/if}
