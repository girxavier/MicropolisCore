<script lang="ts">
	import type { MapViewport } from '@micropolis/render-core';
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { loadScenarioData, type AgriculturalZone } from '$lib/smcity/scenarioData';
	interface Props { getViewport: () => MapViewport | null | undefined; }
	let { getViewport }: Props = $props();
	const viewport = $derived.by(() => { void micropolisReactive.mapCameraRevision; return getViewport() ?? null; });
	const zones = $derived.by(() => {
		void micropolisReactive.mapRevision;
		const id = micropolisReactive.cityFileName || micropolisReactive.cityName || 'default';
		return Object.values(loadScenarioData(id).agriculturalZones ?? {});
	});
	function bounds(zone: AgriculturalZone) {
		if (!viewport) return null;
		const [left, top] = viewport.worldPixelToScreen([(zone.x - 1) * 16, (zone.y - 1) * 16]);
		return { left, top, width: 3 * viewport.tileWidth * viewport.zoom, height: 3 * viewport.tileHeight * viewport.zoom };
	}
</script>
<div class="agriculture-layer" aria-hidden="true">
	{#if viewport}
		{#each zones as zone (zone.id)}
			{@const rect = bounds(zone)}
			{#if rect}
				<img src={`/images/agriculture/A_MAR_BIO_D${zone.level}.png`} alt="" draggable="false"
					style={`left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`} />
			{/if}
		{/each}
	{/if}
</div>
<style>
	.agriculture-layer { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:6; }
	.agriculture-layer img { position:absolute; max-width:none; image-rendering:pixelated; user-select:none; }
</style>
