<script lang="ts">
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { toolState } from '$lib/ToolState.svelte';
	import { getConstructionTypeLabel } from '$lib/smcity/constructionCatalog';

	const zs = $derived(micropolisReactive.zoneStatus);
	const queryActive = $derived(toolState.activeToolId === 'query');
	const zoneLocked = $derived(zs.visible ? micropolisReactive.isZoneLockedAt(zs.x, zs.y) : false);
	const typeProperties = $derived(zs.visible && zs.constructionTypeId ? micropolisReactive.getScenarioConstructionProperties(zs.constructionTypeId) : {});
	const canEditType = $derived(!!zs.visible && !!zs.constructionTypeId);
	const canLockZone = $derived(zs.visible && micropolisReactive.isZoneLockableAt(zs.x, zs.y));

	function setLocalLock(event: Event): void {
		if (!zs.visible) return;
		micropolisReactive.setZoneLockedAt(zs.x, zs.y, (event.currentTarget as HTMLInputElement).checked);
	}

	function setNumericProperty(property: string, event: Event, min?: number, max?: number): void {
		if (!zs.visible || !zs.constructionTypeId) return;
		const raw = (event.currentTarget as HTMLInputElement).value;
		if (raw.trim() === '') return;
		const value = Number(raw);
		if (!Number.isFinite(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) return;
		micropolisReactive.setScenarioConstructionProperty(zs.constructionTypeId, property, value);
	}

	function close(): void {
		micropolisReactive.clearZoneStatus();
	}
</script>

{#if queryActive}
	<div class="zone-panel" role="dialog" aria-label="Inspection et paramètres de construction">
		{#if zs.visible}
			<div class="zone-header">
				<span class="zone-title">QUERY · {zs.constructionTypeId ? getConstructionTypeLabel(zs.constructionTypeId) : 'Terrain / objet non catalogué'}</span>
				<span class="zone-tile">Case {zs.x}, {zs.y}</span>
				<button type="button" class="zone-close" onclick={close}>Fermer</button>
			</div>
			<dl class="zone-stats">
				<div class="stat"><dt>Catégorie</dt><dd>{zs.tileCategory}</dd></div>
				<div class="stat"><dt>Densité</dt><dd>{zs.populationDensity}</dd></div>
				<div class="stat"><dt>Valeur foncière</dt><dd>{zs.landValue}</dd></div>
				<div class="stat"><dt>Criminalité</dt><dd>{zs.crimeRate}</dd></div>
				<div class="stat"><dt>Pollution</dt><dd>{zs.pollution}</dd></div>
				<div class="stat"><dt>Croissance</dt><dd>{zs.growthRate}</dd></div>
			</dl>
			{#if canEditType}
				<div class="type-editor" aria-label="Paramètres partagés de cette catégorie">
					<strong>Paramètres communs à cette catégorie</strong>
					<label>Indice climatique <input type="number" min="-100" max="100" step="1" value={typeProperties.climateIndex ?? ''} placeholder="Défaut" onchange={(event) => setNumericProperty('climateIndex', event, -100, 100)} /></label>
					<label>Facteur de pollution <input type="number" step="1" value={typeProperties.pollution ?? ''} placeholder="Défaut" onchange={(event) => setNumericProperty('pollution', event)} /></label>
				</div>
			{/if}
			{#if canLockZone}
				<label class="zone-lock"><input type="checkbox" checked={zoneLocked} onchange={setLocalLock} /> Bloquer les évolutions à la hausse (le déclin reste possible)</label>
			{/if}
		{:else}
			<div class="query-prompt">
				<strong>QUERY · Inspection d'une case</strong>
				<span>Cliquez sur un bâtiment ou un terrain de la carte pour afficher ses informations et ses paramètres.</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.zone-panel {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 26;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.45rem 0.65rem 0.5rem;
		box-sizing: border-box;
		background: rgba(8, 12, 20, 0.94);
		border-top: 1px solid rgba(255, 255, 255, 0.16);
		color: #eef2ff;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		pointer-events: auto;
	}
	.query-prompt { display:flex; flex-wrap:wrap; align-items:center; gap:.4rem 1rem; }
	.query-prompt span { color:#c9d8ee; }
	.type-editor { display:flex; flex-wrap:wrap; align-items:center; gap:.45rem 1rem; padding-top:.2rem; }
	.type-editor strong { color:#c9f3d5; }
	.type-editor label { display:flex; align-items:center; gap:.4rem; color:#c9d8ee; }
	.type-editor input { width:5.5rem; border:1px solid rgba(255,255,255,.25); border-radius:3px; padding:.2rem .3rem; background:rgba(255,255,255,.08); color:#fff; font:inherit; }
	.zone-lock { display:flex; align-items:center; gap:.45rem; color:#c9f3d5; font-weight:600; }
	.zone-lock input { accent-color:#42a77e; }
	.zone-header { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.75rem; }
	.zone-title { font-weight:700; font-size:.76rem; white-space:nowrap; }
	.zone-tile { color:#ffc840; font-variant-numeric:tabular-nums; white-space:nowrap; }
	.zone-close { border:1px solid rgba(255,255,255,.25); border-radius:4px; background:rgba(255,255,255,.08); color:#eef2ff; font:inherit; font-size:.68rem; font-weight:600; line-height:1; padding:.28rem .55rem; cursor:pointer; white-space:nowrap; }
	.zone-close:hover { background:rgba(255,255,255,.16); }
	.zone-stats { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:.35rem .75rem; margin:0; }
	.stat { display:grid; grid-template-columns:1fr auto; align-items:baseline; gap:.45rem; min-width:0; }
	dt { margin:0; opacity:.72; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	dd { margin:0; font-variant-numeric:tabular-nums; font-weight:600; text-align:right; }
</style>
