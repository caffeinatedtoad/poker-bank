<script lang="ts">
	import type { Snippet } from 'svelte';

	// A list of actions rising from the bottom of the screen, within thumb reach. Choosing one calls its
	// `onselect`. The parent then swaps this sheet for that action's ConfirmDialog.
	interface Option {
		label: string;
		tone?: 'primary' | 'danger';
		disabled?: boolean;
		onselect: () => void;
	}
	interface Props {
		title: string;
		subtitle: string;
		options: Option[];
		onclose: () => void;
		/** Optional content between the heading and the actions (the player's history). */
		children?: Snippet;
	}
	let { title, subtitle, options, onclose, children }: Props = $props();

	let dialog: HTMLDialogElement;
	$effect(() => dialog.showModal());

	const toneClass = { primary: 'btn-primary', danger: 'btn-ghost text-error' };
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" {onclose}>
	<div class="modal-box grid gap-2">
		<div class="mb-2">
			<h2 class="font-display text-3xl font-bold break-words">{title}</h2>
			<p class="font-display text-xl tabular-nums opacity-80">{subtitle}</p>
		</div>
		{@render children?.()}
		{#each options as option (option.label)}
			<button
				class="btn h-14 text-base {option.tone ? toneClass[option.tone] : ''}"
				disabled={option.disabled}
				onclick={option.onselect}>{option.label}</button
			>
		{/each}
		<button class="btn h-14 btn-ghost text-base" onclick={() => dialog.close()}>Cancel</button>
	</div>
	<form method="dialog" class="modal-backdrop"><button>Close</button></form>
</dialog>
