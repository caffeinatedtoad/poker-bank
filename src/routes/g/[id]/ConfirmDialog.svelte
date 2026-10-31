<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	// Props are this component's parameters, like a function signature for a template.
	interface Props {
		title: string;
		/** The form action to post to, e.g. "?/clear". Omit it and pass `onconfirm` for a browser-only choice. */
		action?: string;
		onconfirm?: () => void;
		confirmLabel: string;
		danger?: boolean;
		disabled?: boolean;
		/**
		 * Where the sheet sits on a phone. Use "top" when the body has a text field: iOS Safari doesn't
		 * resize the page for its keyboard, so a bottom sheet's buttons would end up hidden behind it.
		 */
		position?: 'top' | 'bottom';
		/** Called once the dialog closes, whether confirmed, cancelled, or dismissed with Esc. */
		onclose: () => void;
		/** The dialog body: explanation text plus any inputs (e.g. hidden playerId) to submit. */
		children: Snippet;
	}
	let {
		title,
		action,
		onconfirm,
		confirmLabel,
		danger = false,
		disabled = false,
		position = 'bottom',
		onclose,
		children
	}: Props = $props();

	let dialog: HTMLDialogElement;
	let submitting = $state(false); // blocks a second tap while a slow phone connection is still posting

	// The parent mounts this component only when a confirmation is pending, so open it on mount.
	// $effect runs after the element is on the page, like code after a render.
	$effect(() => dialog.showModal());

	function confirmLocally(event: SubmitEvent) {
		event.preventDefault(); // no server round trip
		onconfirm?.();
		dialog.close();
	}
</script>

{#snippet body()}
	<h2 class="font-display text-3xl font-bold break-words">{title}</h2>
	{@render children()}
	<div class="mt-2 grid grid-cols-2 gap-3">
		<button type="button" class="btn btn-ghost" onclick={() => dialog.close()}>Cancel</button>
		<button
			class={danger ? 'btn btn-error' : 'btn btn-primary'}
			disabled={disabled || submitting}
			aria-busy={submitting}>{confirmLabel}</button
		>
	</div>
{/snippet}

<dialog
	bind:this={dialog}
	class="modal sm:modal-middle {position === 'top' ? 'modal-top' : 'modal-bottom'}"
	{onclose}
>
	{#if action}
		<form
			method="POST"
			{action}
			class="modal-box grid gap-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update(); // apply the action result and re-run load(), as plain use:enhance would
					dialog.close();
				};
			}}
		>
			{@render body()}
		</form>
	{:else}
		<form class="modal-box grid gap-4" onsubmit={confirmLocally}>
			{@render body()}
		</form>
	{/if}
	<!-- Tapping outside the box closes it. method="dialog" is the browser's built-in close-on-submit. -->
	<form method="dialog" class="modal-backdrop"><button>Close</button></form>
</dialog>
