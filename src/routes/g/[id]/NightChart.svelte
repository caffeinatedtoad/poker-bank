<script lang="ts">
	import { describeBalance, formatCents } from '#lib/money.ts';
	import {
		KIND_LABEL,
		niceCeil,
		resultSeries,
		signedCents,
		when,
		type HistoryEntry
	} from '#lib/history.ts';
	import type { SVGAttributes } from 'svelte/elements';

	// A step line of the player's running result: it climbs into green above $0 when they're up and
	// drops into red below when they're down. Plain SVG; each point is one change from their history.
	interface Props {
		name: string;
		/** Newest first, as the history endpoint returns them. */
		entries: HistoryEntry[];
		balanceCents: number;
		/** Draw just the chart, sized to fill its container, with no readout and no interaction. */
		background?: boolean;
		/** Height in px of the interactive chart (a background chart takes its container's). */
		height?: number;
	}
	let {
		name,
		entries,
		balanceCents,
		background = false,
		height: fixedHeight = 160
	}: Props = $props();

	const uid = $props.id(); // unique per component instance, for the SVG clip-path and gradient ids
	// An interactive chart is a fixed height; a background chart measures its container's (a player row).
	// svelte-ignore state_referenced_locally
	let height = $state(background ? 96 : fixedHeight);
	// The sheet keeps its axis labels in a left gutter and times along the bottom. Behind a player row
	// the left is under their name, so the labels move to a right-hand column (as on a trading app's
	// price chart), next to where the newest change and the end dot are.
	const AXIS = 48;
	let PAD = $derived(
		background
			? { top: 10, right: AXIS, bottom: 10, left: 0 }
			: { top: 14, right: 16, bottom: 26, left: 52 }
	);

	let width = $state(280); // measured from the container below; the SVG never sets its own width
	let points = $derived(resultSeries(entries, balanceCents));
	let results = $derived(points.map((p) => p.resultCents));
	// Axis extents: clean values at or beyond the best and worst moments. All-even gets ±$1 so $0 sits mid-chart.
	let hi = $derived(niceCeil(Math.max(0, ...results)));
	let lo = $derived(niceCeil(Math.max(0, ...results.map((r) => -r))));
	let span = $derived(hi + lo || 200);
	let top = $derived(hi + lo ? hi : 100);

	let plotBottom = $derived(height - PAD.bottom);
	let y = (cents: number) => PAD.top + ((top - cents) / span) * (plotBottom - PAD.top);
	// After the last change the line runs on for part of a step ("now"), so a final jump into the
	// green or red still shows as a stretch of colour rather than a bare vertical tick.
	const TAIL = 0.6;
	let right = $derived(width - PAD.right);
	let stepWidth = $derived((right - PAD.left) / (points.length - 1 + TAIL));
	let x = (i: number) => PAD.left + i * stepWidth;
	let zeroY = $derived(y(0));
	// Axis labels sit right of the plot behind a row, left of it in the sheet.
	let labelX = $derived(background ? width : PAD.left - 8);
	// An extent closer than a line of text to $0 keeps its hairline but loses its label.
	let ticks = $derived(
		[hi, -lo].filter((v) => v !== 0).map((v) => ({ v, labelled: Math.abs(y(v) - zeroY) >= 12 }))
	);

	// Step path: hold each result until the next change, then jump straight to the new value.
	let line = $derived(
		points
			.map((p, i) => (i === 0 ? `M${x(0)},${y(p.resultCents)}` : `H${x(i)}V${y(p.resultCents)}`))
			.join('') + `H${right}`
	);
	let area = $derived(`${line}V${zeroY}H${x(0)}Z`);

	let last = $derived(points[points.length - 1]);
	const tone = (cents: number) =>
		cents > 0 ? 'var(--chart-up)' : cents < 0 ? 'var(--chart-down)' : 'var(--color-base-content)';
	const signed = (cents: number) => (cents === 0 ? '$0' : signedCents(cents));

	// The point being inspected by drag, tap or arrow keys. null shows the hint instead.
	let active = $state<number | null>(null);

	function pick(event: PointerEvent) {
		const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const i = Math.round((event.clientX - box.left - PAD.left) / stepWidth);
		active = Math.min(points.length - 1, Math.max(0, i));
	}

	function onkeydown(event: KeyboardEvent) {
		const i = active ?? points.length - 1;
		const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: points.length - 1 }[
			event.key
		];
		if (next === undefined) return;
		event.preventDefault();
		active = Math.min(points.length - 1, Math.max(0, next));
	}

	let summary = $derived(
		`${name}'s results: best ${signed(Math.max(...results))}, worst ${signed(Math.min(...results))}, now ${describeBalance(balanceCents)}.`
	);

	/** What a screen reader announces for a point (the slider's value text). */
	function describePoint(i: number) {
		const p = points[i];
		const change = p.change
			? `after ${KIND_LABEL[p.change.kind].toLowerCase()} ${signedCents(p.change.deltaCents)}, ${when(p.change.createdAt)}`
			: 'at the start';
		return `${signed(p.resultCents)} ${change}`;
	}

	// Slider role, keyboard and pointer handling, only for the interactive chart in the sheet.
	let interaction = $derived<SVGAttributes<SVGSVGElement>>(
		background
			? {}
			: {
					role: 'slider',
					'aria-label': summary,
					'aria-valuemin': 0,
					'aria-valuemax': points.length - 1,
					'aria-valuenow': active ?? points.length - 1,
					'aria-valuetext': describePoint(active ?? points.length - 1),
					'aria-orientation': 'horizontal',
					tabindex: 0,
					onpointerdown: pick,
					onpointermove: pick,
					onpointerleave: () => (active = null),
					onfocus: () => (active = points.length - 1),
					onblur: () => (active = null),
					onkeydown
				}
	);
</script>

{#if background}
	<!-- Fills its positioned parent. Being absolute, its size never depends on the SVG's, so measuring
	     it can't feed back into the SVG (and before hydration the overflow is clipped, not spilled). -->
	<div class="absolute inset-0 overflow-hidden" bind:clientWidth={width} bind:clientHeight={height}>
		{@render chart()}
	</div>
{:else}
	<figure class="mb-2">
		<!-- Fixed readout above the chart: on a phone a floating tooltip would sit under your finger. -->
		<p class="flex min-h-11 items-center text-sm" aria-hidden="true">
			{#if active === null}
				<span class="opacity-75">Drag across the chart to see each change.</span>
			{:else}
				{@const p = points[active]}
				<span>
					<span class="font-display text-lg font-bold tabular-nums">{signed(p.resultCents)}</span>
					<span class="opacity-75">
						{#if p.change}
							after {KIND_LABEL[p.change.kind].toLowerCase()}
							{signedCents(p.change.deltaCents)}, {when(p.change.createdAt)}
						{:else}
							at the start
						{/if}
					</span>
				</span>
			{/if}
		</p>

		<div class="min-w-0" bind:clientWidth={width}>
			{@render chart()}
		</div>
	</figure>
{/if}

{#snippet chart()}
	<svg
		viewBox="0 0 {width} {height}"
		{height}
		{...interaction}
		class="block w-full touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
	>
		<defs>
			<clipPath id="{uid}-up"><rect x="0" y="0" {width} height={zeroY} /></clipPath>
			<clipPath id="{uid}-down"><rect x="0" y={zeroY} {width} height={height - zeroY} /></clipPath>
			<!-- The line is green above $0 and red below, switching exactly at the zero line. -->
			<linearGradient
				id="{uid}-stroke"
				gradientUnits="userSpaceOnUse"
				x1="0"
				y1="0"
				x2="0"
				y2={height}
			>
				<stop offset={zeroY / height} stop-color="var(--chart-up)" />
				<stop offset={zeroY / height} stop-color="var(--chart-down)" />
			</linearGradient>
		</defs>

		<!-- Axis: hairlines at the clean extents and a stronger $0 baseline. Labels use text colours. -->
		{#each ticks as { v, labelled } (v)}
			<line x1={PAD.left} x2={right} y1={y(v)} y2={y(v)} class="stroke-base-300" />
			{#if labelled}
				<text x={labelX} y={y(v)} dy="0.32em" text-anchor="end" class="tick">{signed(v)}</text>
			{/if}
		{/each}
		<line x1={PAD.left} x2={right} y1={zeroY} y2={zeroY} class="stroke-base-content/40" />
		<text x={labelX} y={zeroY} dy="0.32em" text-anchor="end" class="tick">$0</text>

		<!-- Behind a row the data marks recede so the name and balance on top stay the loudest thing. -->
		<g class:recede={background}>
			<!-- Light washes (--chart-wash) between the line and $0, one per side of the baseline. -->
			<path d={area} fill="var(--chart-up)" clip-path="url(#{uid}-up)" class="wash fade" />
			<path d={area} fill="var(--chart-down)" clip-path="url(#{uid}-down)" class="wash fade" />
			<path
				d={line}
				pathLength="1"
				fill="none"
				stroke="url(#{uid}-stroke)"
				stroke-width="2"
				stroke-linejoin="round"
				stroke-linecap="round"
				class="draw"
			/>

			{#if active !== null}
				<line
					x1={x(active)}
					x2={x(active)}
					y1={PAD.top}
					y2={plotBottom}
					class="stroke-base-content/50"
				/>
				<circle
					cx={x(active)}
					cy={y(points[active].resultCents)}
					r="5"
					fill={tone(points[active].resultCents)}
					class="stroke-base-100"
					stroke-width="2"
				/>
			{/if}

			<!-- End dot (8px+, 2px ring in the sheet colour) with the final result as its label. -->
			<circle
				cx={right}
				cy={y(last.resultCents)}
				r="5"
				fill={tone(last.resultCents)}
				class="fade stroke-base-100"
				stroke-width="2"
			/>
		</g>

		<!-- Start and end times along the bottom (the sheet only: behind a row they'd sit under the balance). -->
		{#if points.length > 1 && !background}
			{@const first = points[1].change}
			{@const final = last.change}
			{#if first}<text x={PAD.left} y={height - 6} class="tick">{when(first.createdAt)}</text>{/if}
			{#if final}<text x={right} y={height - 6} text-anchor="end" class="tick"
					>{when(final.createdAt)}</text
				>{/if}
		{/if}
	</svg>
{/snippet}

<style>
	.wash {
		fill-opacity: var(--chart-wash);
	}
	.recede {
		opacity: 0.45;
	}
	.tick {
		fill: currentColor;
		opacity: 0.7;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	line {
		stroke-width: 1;
	}
	/* The one bit of motion: the line draws itself left to right when the sheet opens. */
	.draw {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 900ms ease-out forwards;
	}
	.fade {
		opacity: 0;
		animation: fade 300ms ease-out 600ms forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes fade {
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.draw,
		.fade {
			animation: none;
			stroke-dashoffset: 0;
			opacity: 1;
		}
	}
</style>
