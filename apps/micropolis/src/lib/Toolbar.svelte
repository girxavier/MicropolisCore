<script lang="ts">
	import { GAME_TOOL_GROUPS, TERRAIN_BRUSHES, toolMenuLabel, type ToolId } from '$lib/gameTools';
	import tileAtlas from '$lib/images/tilesets/all.png';
	import { toolState } from '$lib/ToolState.svelte';
	import { editorModeState } from '$lib/EditorMode.svelte';
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { commandBus } from '$lib/CommandBus';
	let mobileOpen = $state(false);
	let editorNotice = $state('');

	function selectTool(id: ToolId) {
		toolState.setActiveTool(id);
		mobileOpen = false;
	}

	function selectSpeed(index: number) {
		const sim = micropolisReactive.attachedSimulator;
		sim?.setGameSpeed(index);
		sim?.setPaused(false);
		mobileOpen = false;
	}

	function resetMap() {
		if (!confirm('Réinitialiser entièrement la carte ? Cette action efface la ville en cours.')) return;
		micropolisReactive.poke.clearMap();
		micropolisReactive.clearScenarioZoneLocks();
		micropolisReactive.clearScenarioAgriculturalZones();
		micropolisReactive.refreshCityClimateIndex();
		micropolisReactive.syncFromEngine();
		editorNotice = 'Carte réinitialisée.';
	}

	function generateTerrain() {
		if (!confirm('Générer un nouveau terrain ? La carte actuelle sera remplacée.')) return;
		const seed = Math.floor(Math.random() * 0x7fffffff);
		micropolisReactive.poke.generateMap(seed);
		micropolisReactive.clearScenarioZoneLocks();
		micropolisReactive.clearScenarioAgriculturalZones();
		micropolisReactive.refreshCityClimateIndex();
		editorNotice = `Terrain généré · graine ${seed}.`;
	}

	function toggleEditorMode() {
		mobileOpen = false;
		const next = !editorModeState.active;
		editorModeState.set(next);
		if (next) micropolisReactive.attachedSimulator?.enterEditorMode();
		else {
			if (['clear', 'terrain-paint', 'water', 'land', 'forest'].includes(toolState.activeToolId)) {
				toolState.setActiveTool('road');
			}
			micropolisReactive.refreshCityClimateIndex();
			micropolisReactive.attachedSimulator?.exitEditorMode();
		}
	}
</script>

<button type="button" class="mobile-toolbar-toggle" aria-expanded={mobileOpen} onclick={() => mobileOpen = !mobileOpen}>
	{mobileOpen ? 'FERMER' : 'OUTILS ☰'}
</button>
<nav class="toolbar" class:mobile-open={mobileOpen} aria-label="City tools">
	<button type="button" class="mode-toggle" class:active={editorModeState.active} onclick={toggleEditorMode}>
		{editorModeState.active ? 'REPRENDRE LE JEU' : 'MODE MAQUETTISTE'}
	</button>
	<button type="button" class="mode-toggle scenario-panel-toggle" class:active={editorModeState.scenarioPanelOpen}
		aria-expanded={editorModeState.scenarioPanelOpen}
		onclick={() => editorModeState.toggleScenarioPanel()}>
		{editorModeState.scenarioPanelOpen
			? (editorModeState.active ? 'FERMER DONNÉES & SCÉNARIOS' : 'FERMER SCÉNARIOS')
			: (editorModeState.active ? 'DONNÉES & SCÉNARIOS' : 'SCÉNARIOS')}
	</button>
	{#if editorModeState.active}
		<div class="tool-group-label">Carte et terrain</div>
		<button type="button" class="tool-item clear-tool" onclick={() => selectTool('clear')}>CLEAR · Terre nue</button>
		<button type="button" class="tool-item" onclick={generateTerrain}>Générer un terrain</button>
		<button type="button" class="tool-item" onclick={resetMap}>RESET · Carte vierge</button>
		{#if editorNotice}<div class="tool-group-label" role="status">{editorNotice}</div>{/if}
		<div class="tool-group-label">Historique</div>
		<button type="button" class="tool-item" onclick={() => commandBus.undo()}>↶ Annuler (Ctrl+Z)</button>
		<button type="button" class="tool-item" onclick={() => commandBus.redo()}>↷ Rétablir (Ctrl+Y)</button>
		{#each GAME_TOOL_GROUPS as group (group.id)}
			<details class="tool-category" open={group.id === 'terrain'}>
				<summary>{group.label ?? group.id}</summary>
				{#each group.tools.filter((tool) => tool.id !== 'clear') as tool (tool.id)}
					<button type="button" class="tool-item" class:active={toolState.activeToolId === tool.id}
						title={tool.label} onclick={() => selectTool(tool.id)}>
						{#if tool.shortcut !== '—'}<span class="tool-key">{tool.shortcut}:</span>{/if}
						<span class="tool-name">{tool.label}</span>
					</button>
				{/each}
			</details>
		{/each}
		{#if toolState.activeToolId === 'terrain-paint'}
			<div class="tool-group-label">Peindre le terrain</div>
			<div class="terrain-brush-palette" role="group" aria-label="Type de terrain à peindre">
				{#each TERRAIN_BRUSHES as brush (brush.id)}
					<button type="button" class="terrain-brush" class:active={toolState.activeTerrainBrush === brush.id}
						aria-pressed={toolState.activeTerrainBrush === brush.id}
						title={brush.label}
						onclick={() => toolState.setTerrainBrush(brush.id)}>
						<span class="terrain-thumb" aria-hidden="true"
							style={`background-image:url("${tileAtlas}");background-position:-${(brush.tileId % 16) * 32}px -${Math.floor(brush.tileId / 16) * 32}px;`}></span>
						<span>{brush.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="tool-group-label">Vitesse du jeu</div>
		{#each [{ index: 0, label: 'Lente · 58 s/mois' }, { index: 1, label: 'Normale · 29 s/mois' }, { index: 2, label: 'Rapide · 10 s/mois' }] as speed}
			<button type="button" class="tool-item" class:active={micropolisReactive.gameSpeedIndex === speed.index} onclick={() => selectSpeed(speed.index)}>
				<span class="tool-key">{speed.index + 1}:</span><span class="tool-name">{speed.label}</span>
			</button>
		{/each}
		{#each GAME_TOOL_GROUPS.filter((group) => group.id !== 'terrain' && !group.id.endsWith('-buildings')) as group (group.id)}
			{#if group.label}<div class="tool-group-label">{group.label}</div>{/if}
			{#each group.tools.filter((tool) => tool.id !== 'clear') as tool (tool.id)}
				<button type="button" class="tool-item" class:active={toolState.activeToolId === tool.id}
					title="{tool.shortcut}: {toolMenuLabel(tool)}" onclick={() => selectTool(tool.id)}>
					<span class="tool-key">{tool.shortcut}:</span><span class="tool-name">{toolMenuLabel(tool)}</span>
				</button>
			{/each}
		{/each}
	{/if}
</nav>

<style>
	.mobile-toolbar-toggle { display: none; }

	.toolbar {
		flex-shrink: 0;
		width: max-content;
		max-width: 40vw;
		height: 100%;
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		margin: 0;
		padding: 0.2rem 0;
		overflow-x: hidden;
		overflow-y: auto;
		background: rgba(26, 26, 46, 0.94);
		border: none;
		border-right: 1px solid #5a5a78;
		box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.06);
		font-family: ui-monospace, 'Chicago', 'Geneva', monospace;
		contain: layout style;
		scrollbar-width: thin;
		scrollbar-color: #4a4a68 transparent;
	}

	.mode-toggle {
		margin: 0.3rem;
		padding: 0.45rem 0.35rem;
		border: 1px solid #9aa8c8;
		border-radius: 4px;
		background: #253c5f;
		color: #fff;
		font: inherit;
		font-size: 0.62rem;
		font-weight: 800;
		cursor: pointer;
	}
	.mode-toggle.active { background: #79522c; border-color: #e3b878; }

	.terrain-brush-palette { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.2rem; padding:.25rem .35rem .45rem; }
	.terrain-brush { display:flex; flex-direction:column; align-items:center; gap:.2rem; min-width:0; padding:.3rem .1rem; border:1px solid #52647f; border-radius:3px; background:#1e293b; color:#e8eeff; font:inherit; font-size:.48rem; cursor:pointer; }
	.terrain-brush.active { border-color:#f0c16a; background:#304878; box-shadow:inset 0 0 0 1px #f0c16a; }
	.terrain-thumb { display:block; width:32px; height:32px; flex:0 0 32px; background-size:512px 1920px; background-repeat:no-repeat; image-rendering:pixelated; }
	.tool-category { border-top: 1px solid rgba(255,255,255,.1); }
	.tool-category summary {
		padding: .35rem .45rem;
		color: #c4cbe0;
		font-size: .58rem;
		font-weight: 800;
		text-transform: uppercase;
		cursor: pointer;
		user-select: none;
	}
	.tool-category[open] summary { color: #f0c16a; }

	.tool-group-label {
		padding: 0.28rem 0.45rem 0.05rem;
		font-size: 0.46rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #8a92b0;
		user-select: none;
	}

	.tool-group-label:not(:first-child) {
		margin-top: 0.08rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding-top: 0.32rem;
	}

	.tool-item {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		margin: 0;
		padding: 0.1rem 0.45rem;
		border: none;
		border-radius: 0;
		background: transparent;
		color: #e8eeff;
		cursor: pointer;
		font: inherit;
		font-size: 0.54rem;
		font-weight: 500;
		line-height: 1.15;
		text-align: left;
		white-space: nowrap;
		box-sizing: border-box;
		outline: none;
		gap: 0.2rem;
	}

	.tool-key {
		flex: 0 0 auto;
		font-weight: 700;
		color: #ffc840;
	}

	.tool-name {
		flex: 1 1 auto;
		text-align: left;
	}

	.tool-item:hover {
		background: rgba(46, 46, 80, 0.85);
		color: #fff;
	}

	.tool-item.active {
		background: #304878;
		color: #fff;
		box-shadow: inset 2px 0 0 #8ab8ff;
	}

	.tool-item.active .tool-key {
		color: #ffe566;
	}

	@media (max-width: 700px) {
		.mobile-toolbar-toggle {
			display: block;
			position: absolute;
			left: .5rem;
			top: 6.4rem;
			z-index: 31;
			padding: .5rem .65rem;
			border: 1px solid #9aa8c8;
			border-radius: 4px;
			background: rgba(26, 26, 46, .96);
			color: #fff;
			font: 700 .68rem ui-monospace, monospace;
			box-shadow: 0 2px 8px rgba(0,0,0,.35);
		}
		.toolbar {
			position: absolute;
			left: 0;
			top: 0;
			width: min(17rem, 82vw);
			max-width: 82vw;
			height: 100%;
			transform: translateX(-105%);
			transition: transform .18s ease;
			z-index: 30;
			padding-top: 3.2rem;
			box-shadow: 4px 0 18px rgba(0,0,0,.35);
		}
		.toolbar.mobile-open { transform: translateX(0); }
		.tool-item { font-size: .68rem; padding: .22rem .55rem; }
		.tool-group-label, .tool-category summary { font-size: .65rem; }
		.mode-toggle { font-size: .7rem; padding: .55rem; }
	}
</style>
