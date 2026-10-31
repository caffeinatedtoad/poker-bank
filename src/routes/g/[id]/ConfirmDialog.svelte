<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	// Props are this component's parameters, like a function signature for a template.
	interface Props {
		title: string;
		/** The form action to post to, e.g. "?/clear". */
		action: string;
		confirmLabel: string;
		danger?: boolean;
		disabled?: boolean;
		/** Called once the dialog closes, whether confirmed, cancelled, or dismissed with Esc. */
		onclose: () => void;
		/** The dialog body: explanation text plus any inputs (e.g. hidden playerId) to submit. */
		children: Snippet;
	}
	let {
		title,
		action,
		confirmLabel,
		danger = false,
		disabled = false,
		onclose,
		children
	}: Props = $props();

	let dialog: HTMLDialogElement;

	// The parent mounts this component only when a confirmation is pending, so open it on mount.
	// $effect runs after the element is on the page, like code after a render.
	$effect(() => dialog.showModal());
</script>

<dialog bind:this={dialog} class="modal modal-bottom sm:modal-middle" {onclose}>
	<form
		method="POST"
		{action}
		class="modal-box grid gap-4"
		use:enhance={() =>
			async ({ update }) => {
				await update(); // apply the action result and re-run load(), as plain use:enhance would
				dialog.close();
			}}
	>
		<h2 class="font-display text-3xl font-bold">{title}</h2>
		{@render children()}
		<div class="modal-action mt-0">
			<button type="button" class="btn btn-ghost" onclick={() => dialog.close()}>Cancel</button>
			<button class={danger ? 'btn btn-error' : 'btn btn-primary'} {disabled}>{confirmLabel}</button
			>
		</div>
	</form>
	<!-- Tapping outside the box closes it. method="dialog" is the browser's built-in close-on-submit. -->
	<form method="dialog" class="modal-backdrop"><button>Close</button></form>
</dialog>
