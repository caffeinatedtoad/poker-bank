<script lang="ts">
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { describeBalance, formatCents, parseCents, toInputValue } from '#lib/money.ts';
	import ActionSheet from './ActionSheet.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import NightChart from './NightChart.svelte';
	import { KIND_LABEL, signedCents, when } from '#lib/history.ts';
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
	let chipLabel = $derived(amountValid ? `+${formatCents(amountCents!)}` : '?');

	// The −/+ buttons in the bottom bar change the amount without opening the keyboard.
	const STEP_CENTS = 500;
	function step(direction: 1 | -1) {
		const next =
			(amountValid ? amountCents! : data.group.defaultBuyinCents) + direction * STEP_CENTS;
		if (next > 0) amount = toInputValue(next);
	}

	// Which sheet or confirmation is open, if any. 'menu' is the ⋯ sheet (history and actions) for a player.
	// 'chart' is the bigger, interactive chart a tap on a row's background chart opens.
	type PlayerSheet = 'buyin' | 'menu' | 'chart' | 'cashout' | 'set' | 'clear' | 'remove';
	let pending = $state<
		{ kind: PlayerSheet; playerId: number } | { kind: 'amount' | 'deleteGroup' } | null
	>(null);
	let pendingPlayerId = $derived(pending && 'playerId' in pending ? pending.playerId : null);
	let pendingPlayer = $derived(data.players.find((p) => p.id === pendingPlayerId));

	let setValue = $state('');
	let setCents = $derived(parseCents(setValue));
	let cashoutValue = $state('');
	let cashoutCents = $derived(parseCents(cashoutValue));
	let cashoutValid = $derived(cashoutCents !== null && cashoutCents > 0);
	let amountDraft = $state('');
	let amountDraftCents = $derived(parseCents(amountDraft));
	let amountDraftValid = $derived(amountDraftCents !== null && amountDraftCents > 0);
	let makeDefault = $state(false);
	let defaultForm = $state<HTMLFormElement>();

	function open(kind: PlayerSheet, player: { id: number; balanceCents: number }) {
		setValue = toInputValue(player.balanceCents);
		cashoutValue = '';
		pending = { kind, playerId: player.id };
	}

	function openAmount() {
		amountDraft = amount;
		makeDefault = false;
		pending = { kind: 'amount' };
	}

	function applyAmount() {
		amount = amountDraft;
		// requestSubmit() posts the hidden form below as if its button were pressed (use:enhance included).
		if (makeDefault) queueMicrotask(() => defaultForm?.requestSubmit());
	}

	// Every buy-in is confirmed first, then offers Undo for a few seconds. Anything that still slips
	// through can be removed from the player's history in their ⋯ sheet.
	let toast = $state<{ text: string; undoEntryId?: number } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function showToast(text: string, undoEntryId?: number) {
		clearTimeout(toastTimer);
		toast = { text, undoEntryId };
		toastTimer = setTimeout(() => (toast = null), 6000);
	}

	function buyInAdded(player: { name: string }, cents: number, result?: Record<string, unknown>) {
		navigator.vibrate?.(10); // a light tick on Android; iPhones ignore it
		if (typeof result?.entryId === 'number') {
			showToast(`Added ${formatCents(cents)} to ${player.name}`, result.entryId);
		}
	}

	// Poll for other people's changes: re-run load() every 5s while the tab is visible.
	// $effect runs in the browser only; the function it returns is cleanup, like a deferred ticker.Stop().
	$effect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) refreshAll();
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>{data.group.name}, Poker Tracker</title></svelte:head>

<!-- A snippet is a reusable piece of markup inside this file, like {{define "balance"}} in Go templates. -->
{#snippet balance(cents: number, align: 'start' | 'end')}
	<span
		class="font-display font-bold tabular-nums"
		class:text-primary={cents < 0}
		class:text-error={cents > 0}
		class:block={align === 'end'}
		class:text-right={align === 'end'}
	>
		{formatCents(Math.abs(cents))}
		{#if cents !== 0}<span class="font-sans text-sm font-normal" class:block={align === 'end'}
				>{cents < 0 ? 'in the green' : 'in the red'}</span
			>{/if}
	</span>
{/snippet}

<div class={isBank ? 'pb-36' : ''}>
	<h1 class="font-display text-3xl leading-none font-extrabold break-words sm:text-4xl">
		{data.group.name}
	</h1>
	<p class="mt-2 text-sm opacity-75">
		{isBank ? 'You are the bank.' : `Bank: ${data.group.bankEmail}`}
	</p>

	<section class="mt-4 border-b-2 border-base-content pb-3">
		<p class="text-sm">{total < 0 ? 'The bank owes' : 'Owed to the bank'}</p>
		<p class="font-display text-5xl leading-none font-extrabold tabular-nums sm:text-6xl">
			{formatCents(Math.abs(total))}
		</p>
	</section>

	{#if form?.error}
		<p role="alert" class="mt-4 rounded-box bg-error px-4 py-3 text-error-content">{form.error}</p>
	{/if}

	{#if data.players.length === 0}
		<p class="mt-6 text-lg">
			{isBank ? 'No players yet. Add the first one below.' : 'No players yet.'}
		</p>
	{:else}
		<ul class="divide-y divide-base-300">
			{#each data.players as player (player.id)}
				{@const history = data.history[player.id]}
				<!-- A grid so their chart can share the first cell with the name: it then ends where the chip
				     (or the balance) begins, and never hides the newest change. isolate keeps the -z-10
				     chart behind this row's text without dropping under the page. -->
				<li
					class="isolate grid min-h-24 items-center gap-2 py-3 {isBank
						? 'grid-cols-[minmax(0,1fr)_auto_auto]'
						: 'grid-cols-[minmax(0,1fr)_auto]'}"
				>
					{#if history}
						<!-- Their night as a backdrop, reaching into the row's padding (-my-3) so it uses the row's
						     full height. It's also a button: tapping it (or the name on top, which lets taps
						     through) opens the chart large enough to drag across. -->
						<button
							class="relative -z-10 col-start-1 row-start-1 -my-3 cursor-pointer self-stretch outline-none focus-visible:outline-2 focus-visible:outline-base-content active:bg-base-200"
							aria-label="Show {player.name}'s chart"
							onclick={() => open('chart', player)}
						>
							<NightChart
								background
								name={player.name}
								entries={history}
								balanceCents={player.balanceCents}
							/>
						</button>
					{/if}
					{#if isBank}
						<!-- pr-12 keeps the name clear of the chart's axis labels, which sit at the cell's right. -->
						<div
							class="col-start-1 row-start-1 min-w-0"
							class:pr-12={history}
							class:halo={history}
							class:pointer-events-none={history}
						>
							<p class="line-clamp-2 font-display text-2xl leading-tight font-bold break-words">
								{player.name}
							</p>
							<p class="text-2xl">{@render balance(player.balanceCents, 'start')}</p>
						</div>
						<button
							class="chip"
							data-size={chipLabel.length > 7 ? 'sm' : chipLabel.length > 5 ? 'md' : undefined}
							disabled={!amountValid}
							aria-label="Buy in {player.name} for {amountValid
								? formatCents(amountCents!)
								: 'an invalid amount'}"
							onclick={() => open('buyin', player)}
						>
							{chipLabel}
						</button>
						<button
							class="btn btn-square size-12 btn-ghost"
							aria-label="More for {player.name}"
							onclick={() => open('menu', player)}
						>
							<svg viewBox="0 0 24 24" class="size-6" fill="currentColor" aria-hidden="true">
								<circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle
									cx="19"
									cy="12"
									r="2"
								/>
							</svg>
						</button>
					{:else}
						<p
							class="col-start-1 row-start-1 min-w-0 font-display text-2xl leading-tight font-bold break-words"
							class:pr-12={history}
							class:halo={history}
							class:pointer-events-none={history}
						>
							{player.name}
						</p>
						<p class="text-3xl">{@render balance(player.balanceCents, 'end')}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if isBank}
		<form method="POST" action="?/addPlayer" use:enhance class="mt-6 flex items-end gap-2">
			<label class="grid min-w-0 flex-1 gap-1">
				<span class="text-sm">New player</span>
				<input
					name="name"
					required
					maxlength="40"
					placeholder="Name"
					autocomplete="off"
					autocapitalize="words"
					enterkeyhint="done"
					class="input w-full text-base"
				/>
			</label>
			<button class="btn btn-primary">Add player</button>
		</form>
		<button
			class="btn mt-10 w-full btn-outline btn-error"
			onclick={() => (pending = { kind: 'deleteGroup' })}>Delete group</button
		>
	{/if}
</div>

{#if isBank}
	<!-- Hidden form the amount dialog submits when "make this the default" is ticked. -->
	<form method="POST" action="?/setDefault" use:enhance bind:this={defaultForm} hidden>
		<input type="hidden" name="amount" value={amount} />
	</form>

	{#if toast}
		<div
			role="status"
			class="fixed inset-x-0 z-20 mx-auto flex max-w-xl px-4"
			style="bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 6rem)"
		>
			<div
				class="flex w-full items-center gap-3 rounded-box bg-neutral py-2 pr-2 pl-4 text-neutral-content shadow-lg"
			>
				<span class="min-h-12 min-w-0 flex-1 content-center truncate">{toast.text}</span>
				{#if toast.undoEntryId}
					<form
						method="POST"
						action="?/removeBuyIn"
						use:enhance={() => {
							toast = null;
							return async ({ update }) => update();
						}}
					>
						<input type="hidden" name="entryId" value={toast.undoEntryId} />
						<button class="btn btn-ghost text-neutral-content">Undo</button>
					</form>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Pinned to the bottom, where a thumb rests. Tap the amount to type one; −/+ step by $5. -->
	<div
		class="safe-x safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-base-300 bg-base-200 pt-3"
	>
		<div class="mx-auto flex max-w-xl items-center gap-3">
			<button
				class="btn btn-circle size-14 border-base-300 bg-base-100 text-2xl"
				aria-label="Lower the buy-in by $5"
				disabled={!amountValid || amountCents! <= STEP_CENTS}
				onclick={() => step(-1)}>−</button
			>
			<button
				class="flex min-h-14 flex-1 flex-col items-center justify-center rounded-box active:bg-base-300"
				onclick={openAmount}
				aria-label="Buy-in amount {amountValid
					? formatCents(amountCents!)
					: 'not set'}. Tap to change."
			>
				<span class="text-sm">Buy-in</span>
				<span class="font-display text-3xl leading-none font-extrabold tabular-nums">
					{amountValid ? formatCents(amountCents!) : 'Set amount'}
				</span>
			</button>
			<button
				class="btn btn-circle size-14 border-base-300 bg-base-100 text-2xl"
				aria-label="Raise the buy-in by $5"
				onclick={() => step(1)}>+</button
			>
		</div>
	</div>
{/if}

<!-- One sheet or dialog at a time, mounted only while pending. -->
{#if pending?.kind === 'amount'}
	<ConfirmDialog
		title="Buy-in amount"
		confirmLabel={amountDraftValid ? `Use ${formatCents(amountDraftCents!)}` : 'Use amount'}
		disabled={!amountDraftValid}
		position="top"
		onconfirm={applyAmount}
		onclose={() => (pending = null)}
	>
		<label class="grid gap-1">
			<span>Each chip tap adds this much ($)</span>
			<input
				bind:value={amountDraft}
				inputmode="decimal"
				enterkeyhint="go"
				autocomplete="off"
				class="input w-full font-display text-2xl font-bold tabular-nums"
			/>
		</label>
		{#if amountDraftValid && amountDraftCents !== data.group.defaultBuyinCents}
			<label class="flex min-h-11 items-center gap-3">
				<input type="checkbox" bind:checked={makeDefault} class="checkbox" />
				<span>Make {formatCents(amountDraftCents!)} the group's default</span>
			</label>
		{/if}
	</ConfirmDialog>
{:else if pending?.kind === 'deleteGroup'}
	<ConfirmDialog
		title="Delete {data.group.name}?"
		action="?/deleteGroup"
		confirmLabel="Delete group"
		danger
		onclose={() => (pending = null)}
	>
		<p class="text-lg">
			It disappears for everyone. You can restore it, with every player and balance, from "Deleted
			groups" on the home page.
		</p>
	</ConfirmDialog>
{:else if pending && pendingPlayer}
	{@const p = pendingPlayer}
	{@const history = data.history[p.id] ?? []}
	{#if pending.kind === 'chart'}
		<ActionSheet
			title={p.name}
			subtitle={describeBalance(p.balanceCents)}
			options={[]}
			closeLabel="Close"
			onclose={() => (pending = null)}
		>
			<NightChart name={p.name} entries={history} balanceCents={p.balanceCents} height={240} />
		</ActionSheet>
	{:else if pending.kind === 'menu'}
		<ActionSheet
			title={p.name}
			subtitle={describeBalance(p.balanceCents)}
			onclose={() => (pending = null)}
			options={[
				{ label: 'Cash out', tone: 'primary', onselect: () => open('cashout', p) },
				{ label: 'Set amount', onselect: () => open('set', p) },
				{
					label: 'Clear balance',
					disabled: p.balanceCents === 0,
					onselect: () => open('clear', p)
				},
				{ label: 'Remove player', tone: 'danger', onselect: () => open('remove', p) }
			]}
		>
			{#if history.length > 0}
				<NightChart name={p.name} entries={history} balanceCents={p.balanceCents} />
			{/if}
			<section aria-label="History" class="mb-2 max-h-48 overflow-y-auto border-y border-base-300">
				{#if history.length === 0}
					<p class="py-3 opacity-75">No buy-ins yet.</p>
				{:else}
					<ul class="divide-y divide-base-300">
						{#each history as entry (entry.id)}
							<li class="flex min-h-12 items-center gap-3">
								<span class="min-w-0 flex-1 py-1">
									<span class="block">{KIND_LABEL[entry.kind]}</span>
									<span class="block text-sm opacity-75">{when(entry.createdAt)}</span>
								</span>
								<span class="font-display text-xl tabular-nums"
									>{signedCents(entry.deltaCents)}</span
								>
								{#if entry.kind === 'buyin'}
									<form
										method="POST"
										action="?/removeBuyIn"
										use:enhance={() => {
											const text = `Removed ${formatCents(entry.deltaCents)} buy-in from ${p.name}`;
											return async ({ result, update }) => {
												await update();
												if (result.type === 'success') showToast(text);
											};
										}}
									>
										<input type="hidden" name="entryId" value={entry.id} />
										<button
											class="btn btn-square size-11 btn-ghost text-error"
											aria-label="Remove the {formatCents(entry.deltaCents)} buy-in from {when(
												entry.createdAt
											)}"
										>
											<svg
												viewBox="0 0 24 24"
												class="size-5"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												aria-hidden="true"
											>
												<path
													d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
									</form>
								{:else}
									<span class="size-11 shrink-0" aria-hidden="true"></span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</ActionSheet>
	{:else if pending.kind === 'buyin'}
		<ConfirmDialog
			title="Buy in {p.name}?"
			action="?/buyin"
			confirmLabel={amountValid ? `Add ${formatCents(amountCents!)}` : 'Add'}
			disabled={!amountValid}
			onsuccess={(result) => buyInAdded(p, amountCents!, result)}
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<input type="hidden" name="amount" value={amount} />
			<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
				<dt>Now</dt>
				<dd class="font-display text-2xl tabular-nums">{describeBalance(p.balanceCents)}</dd>
				<dt>After</dt>
				<dd class="font-display text-2xl font-bold tabular-nums">
					{amountValid ? describeBalance(p.balanceCents + amountCents!) : '—'}
				</dd>
			</dl>
		</ConfirmDialog>
	{:else if pending.kind === 'cashout'}
		<ConfirmDialog
			title="Cash out {p.name}"
			action="?/cashout"
			confirmLabel={cashoutValid ? `Cash out ${formatCents(cashoutCents!)}` : 'Cash out'}
			disabled={!cashoutValid}
			position="top"
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<label class="grid gap-1">
				<span>What {p.name} ended the night with ($)</span>
				<input
					name="amount"
					bind:value={cashoutValue}
					inputmode="decimal"
					enterkeyhint="go"
					autocomplete="off"
					class="input w-full font-display text-2xl font-bold tabular-nums"
				/>
			</label>
			<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
				<dt>Now</dt>
				<dd class="font-display text-2xl tabular-nums">{describeBalance(p.balanceCents)}</dd>
				<dt>After</dt>
				<dd
					class="font-display text-2xl font-bold tabular-nums"
					class:text-primary={cashoutValid && p.balanceCents - cashoutCents! < 0}
				>
					{cashoutValid ? describeBalance(p.balanceCents - cashoutCents!) : '—'}
				</dd>
			</dl>
		</ConfirmDialog>
	{:else if pending.kind === 'clear'}
		<ConfirmDialog
			title="Clear {p.name}?"
			action="?/clear"
			confirmLabel="Clear balance"
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<p class="text-lg">
				{p.name} goes from
				<strong class="font-display text-xl tabular-nums">{describeBalance(p.balanceCents)}</strong>
				to <strong class="font-display text-xl">even</strong>. Their history is kept.
			</p>
		</ConfirmDialog>
	{:else if pending.kind === 'set'}
		<ConfirmDialog
			title="Set {p.name}'s amount"
			action="?/set"
			confirmLabel={setCents === null ? 'Set amount' : `Set to ${formatCents(setCents)}`}
			disabled={setCents === null || setCents === p.balanceCents}
			position="top"
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<label class="grid gap-1">
				<span>New amount ($). Positive is in the red; use a minus sign for in the green.</span>
				<input
					name="value"
					bind:value={setValue}
					inputmode="text"
					enterkeyhint="go"
					autocomplete="off"
					class="input w-full font-display text-2xl font-bold tabular-nums"
				/>
			</label>
			<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1">
				<dt>Now</dt>
				<dd class="font-display text-2xl tabular-nums">{describeBalance(p.balanceCents)}</dd>
				<dt>After</dt>
				<dd class="font-display text-2xl font-bold tabular-nums">
					{setCents === null ? 'Enter an amount like 40 or -12.50' : describeBalance(setCents)}
				</dd>
			</dl>
		</ConfirmDialog>
	{:else}
		<ConfirmDialog
			title="Remove {p.name}?"
			action="?/removePlayer"
			confirmLabel="Remove"
			danger
			onclose={() => (pending = null)}
		>
			<input type="hidden" name="playerId" value={p.id} />
			<p class="text-lg">
				{#if p.balanceCents > 0}
					{p.name} is still
					<strong class="font-display text-xl tabular-nums"
						>{describeBalance(p.balanceCents)}</strong
					>, which they owe the bank.
				{:else if p.balanceCents < 0}
					{p.name} is still
					<strong class="font-display text-xl tabular-nums"
						>{describeBalance(p.balanceCents)}</strong
					>, which the bank owes them.
				{/if}
				Removing them deletes their history. This can't be undone.
			</p>
		</ConfirmDialog>
	{/if}
{/if}
