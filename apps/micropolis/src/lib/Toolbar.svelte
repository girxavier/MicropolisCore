<script lang="ts">
	import { GAME_TOOL_GROUPS, TERRAIN_BRUSHES, toolMenuLabel, type ToolId } from '$lib/gameTools';
	import tileAtlas from '$lib/images/tilesets/all.png';
	import { toolState } from '$lib/ToolState.svelte';
	import { editorModeState } from '$lib/EditorMode.svelte';
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { commandBus } from '$lib/CommandBus';
	import { createTerrainSnapshot, DEFAULT_TERRAIN_CONFIG, deleteTerrainSnapshot, listTerrainSnapshots, normalizeBareTerrainTile, saveTerrainSnapshot, validateTerrainConfig, type CompassDirection, type RiverWidth, type TerrainGenerationConfig, type TerrainSnapshot } from '$lib/smcity/terrainEditor';
	let mobileOpen = $state(false);
	let editorNotice = $state('');
	let generatorOpen = $state(false);
	let libraryOpen = $state(false);
	let savedTerrains = $state<TerrainSnapshot[]>([]);
	let lastGeneratedRiverFlow = $state<{ from: CompassDirection; to: CompassDirection } | undefined>(undefined);
	let terrainSeed = $state(1);
	let terrainConfig = $state<TerrainGenerationConfig>({
		seed: DEFAULT_TERRAIN_CONFIG.seed,
		densities: { ...DEFAULT_TERRAIN_CONFIG.densities },
		river: { ...DEFAULT_TERRAIN_CONFIG.river }
	});
	const directionOptions: { value: CompassDirection; label: string }[] = [
		{ value: 'N', label: 'Nord' }, { value: 'NE', label: 'Nord-est' },
		{ value: 'E', label: 'Est' }, { value: 'SE', label: 'Sud-est' },
		{ value: 'S', label: 'Sud' }, { value: 'SW', label: 'Sud-ouest' },
		{ value: 'W', label: 'Ouest' }, { value: 'NW', label: 'Nord-ouest' }
	];
	const widthOptions: { value: RiverWidth; label: string }[] = [
		{ value: 'XS', label: 'Très étroite' }, { value: 'S', label: 'Étroite' },
		{ value: 'M', label: 'Moyenne' }, { value: 'L', label: 'Large' },
		{ value: 'XL', label: 'Très large' }
	];

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

	function openTerrainGenerator() {
		terrainSeed = Math.floor(Math.random() * 0x7fffffff);
		generatorOpen = true;
		mobileOpen = false;
	}

	function applyTerrainGeneration() {
		const config = validateTerrainConfig({ ...terrainConfig, seed: terrainSeed });
		const directionIndex: Record<CompassDirection, number> = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7 };
		const widthIndex: Record<RiverWidth, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
		micropolisReactive.poke.generateTerrainForEditor(
			config.seed, config.densities.water, config.densities.forest,
			config.densities.wasteland, config.densities.isolatedTrees,
			config.river.enabled, directionIndex[config.river.from], directionIndex[config.river.to],
			config.river.sinuosity, widthIndex[config.river.width]
		);
		micropolisReactive.clearScenarioZoneLocks();
		micropolisReactive.clearScenarioAgriculturalZones();
		micropolisReactive.refreshCityClimateIndex();
		micropolisReactive.syncFromEngine();
		lastGeneratedRiverFlow = config.river.enabled ? { from: config.river.from, to: config.river.to } : undefined;
		editorNotice = `Terrain généré · graine ${config.seed}.`;
		generatorOpen = false;
	}

	function openTerrainLibrary() {
		savedTerrains = listTerrainSnapshots();
		libraryOpen = true;
		mobileOpen = false;
	}

	function saveCurrentTerrain() {
		const name = prompt('Nom de ce terrain :');
		if (!name?.trim()) return;
		const width = micropolisReactive.worldWidth;
		const height = micropolisReactive.worldHeight;
		if (!width || !height) return;
		const tiles: number[] = [];
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) tiles.push(normalizeBareTerrainTile(micropolisReactive.peek.tile(x, y) ?? 0));
		}
		const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `terrain-${Date.now()}`;
		const snapshot = createTerrainSnapshot({
			id, name: name.trim(), createdAt: new Date().toISOString(), width, height, tiles,
			riverFlow: lastGeneratedRiverFlow
		});
		savedTerrains = saveTerrainSnapshot(snapshot);
	}

	function loadSavedTerrain(snapshot: TerrainSnapshot) {
		micropolisReactive.poke.loadTerrainTiles(snapshot.width, snapshot.height, snapshot.tiles);
		micropolisReactive.clearScenarioZoneLocks();
		micropolisReactive.clearScenarioAgriculturalZones();
		micropolisReactive.refreshCityClimateIndex();
		lastGeneratedRiverFlow = snapshot.riverFlow;
		editorNotice = `Terrain chargé · ${snapshot.name}.`;
		libraryOpen = false;
	}

	function removeSavedTerrain(id: string) {
		savedTerrains = deleteTerrainSnapshot(id);
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
		<button type="button" class="tool-item" onclick={openTerrainGenerator}>Générer un terrain</button>
		<button type="button" class="tool-item" onclick={openTerrainLibrary}>Bibliothèque de terrains</button>
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

{#if generatorOpen}
	<div class="terrain-generator-backdrop" role="presentation">
		<dialog open class="terrain-generator" aria-labelledby="terrain-generator-title">
			<header class="generator-header">
				<h2 id="terrain-generator-title">Générateur de terrain</h2>
				<button type="button" class="generator-close" aria-label="Fermer" onclick={() => generatorOpen = false}>×</button>
			</header>
			<p class="generator-warning">La génération remplace entièrement la carte actuelle. Aucun aperçu n'est effectué.</p>
			<label class="generator-seed">Graine aléatoire
				<input type="number" min="0" max="2147483647" value={terrainSeed}
					oninput={(event) => terrainSeed = Math.max(0, Math.min(2147483647, Math.floor(Number(event.currentTarget.value) || 0)))} />
			</label>
			<fieldset class="density-fields">
				<legend>Densités relatives</legend>
				<p class="density-help">Les valeurs règlent la répartition relative des quatre types de terrain.</p>
				{#each [
					{ key: 'water', label: 'Eau' },
					{ key: 'forest', label: 'Forêt' },
					{ key: 'wasteland', label: 'Terrain dégagé' },
					{ key: 'isolatedTrees', label: 'Arbres isolés' }
				] as item (item.key)}
					<label class="density-row">
						<span>{item.label}</span>
						<input type="range" min="0" max="100" step="1"
							value={terrainConfig.densities[item.key as keyof TerrainGenerationConfig['densities']]}
							oninput={(event) => terrainConfig.densities[item.key as keyof TerrainGenerationConfig['densities']] = Number(event.currentTarget.value)} />
						<output>{terrainConfig.densities[item.key as keyof TerrainGenerationConfig['densities']]}</output>
					</label>
				{/each}
			</fieldset>
			<fieldset class="river-fields">
				<legend>Rivière</legend>
				<label class="river-enable"><input type="checkbox" checked={terrainConfig.river.enabled}
					onchange={(event) => terrainConfig.river.enabled = event.currentTarget.checked} /> Générer une rivière</label>
				{#if terrainConfig.river.enabled}
					<div class="river-direction">
						<label>Départ
							<select value={terrainConfig.river.from} onchange={(event) => { const next = event.currentTarget.value as CompassDirection; terrainConfig.river.from = next; if (terrainConfig.river.to === next) terrainConfig.river.to = directionOptions.find((option) => option.value !== next)?.value ?? 'E'; }}>
								{#each directionOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
							</select>
						</label>
						<span>vers</span>
						<label>Arrivée
							<select value={terrainConfig.river.to} onchange={(event) => terrainConfig.river.to = event.currentTarget.value as CompassDirection}>
								{#each directionOptions.filter((option) => option.value !== terrainConfig.river.from) as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
							</select>
						</label>
					</div>
					<label class="density-row"><span>Sinuosité</span>
						<input type="range" min="0" max="100" step="1" value={terrainConfig.river.sinuosity}
							oninput={(event) => terrainConfig.river.sinuosity = Number(event.currentTarget.value)} />
						<output>{terrainConfig.river.sinuosity}</output>
					</label>
					<label class="river-width">Largeur
						<select value={terrainConfig.river.width} onchange={(event) => terrainConfig.river.width = event.currentTarget.value as RiverWidth}>
							{#each widthOptions as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
						</select>
					</label>
				{/if}
			</fieldset>
			<footer class="generator-actions">
				<button type="button" class="generator-cancel" onclick={() => generatorOpen = false}>Fermer</button>
				<button type="button" class="generator-submit" onclick={applyTerrainGeneration}>Générer</button>
			</footer>
		</dialog>
	</div>
{/if}

{#if libraryOpen}
	<div class="terrain-generator-backdrop" role="presentation">
		<dialog open class="terrain-generator terrain-library" aria-labelledby="terrain-library-title">
			<header class="generator-header">
				<h2 id="terrain-library-title">Bibliothèque de terrains nus</h2>
				<button type="button" class="generator-close" aria-label="Fermer" onclick={() => libraryOpen = false}>×</button>
			</header>
			<p class="generator-warning">Seuls la terre, l'eau et les arbres sont conservés. Bâtiments, réseaux et données de ville sont exclus.</p>
			<button type="button" class="generator-submit save-terrain" onclick={saveCurrentTerrain}>Enregistrer le terrain actuel</button>
			{#if savedTerrains.length === 0}
				<p class="library-empty">Aucun terrain enregistré dans ce navigateur.</p>
			{:else}
				<ul class="terrain-saved-list">
					{#each savedTerrains as snapshot (snapshot.id)}
						<li>
							<div><strong>{snapshot.name}</strong><small>{snapshot.width} × {snapshot.height} · {new Date(snapshot.createdAt).toLocaleDateString('fr-FR')}</small></div>
							<button type="button" onclick={() => loadSavedTerrain(snapshot)}>Charger</button>
							<button type="button" class="delete-saved" aria-label={`Supprimer ${snapshot.name}`} onclick={() => removeSavedTerrain(snapshot.id)}>×</button>
						</li>
					{/each}
				</ul>
			{/if}
			<footer class="generator-actions"><button type="button" class="generator-cancel" onclick={() => libraryOpen = false}>Fermer</button></footer>
		</section>
	</div>
{/if}

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
	.terrain-generator-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:1rem; background:rgba(5,10,20,.78); }
	.terrain-generator { width:min(34rem,96vw); max-height:92vh; overflow:auto; padding:1rem; border:1px solid #8090b0; border-radius:8px; background:#182338; color:#edf2ff; box-shadow:0 18px 60px #000b; font: .78rem ui-monospace,monospace; }
	.generator-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
	.generator-header h2 { margin:0; font-size:1rem; }
	.generator-close { border:0; background:transparent; color:inherit; font-size:1.6rem; cursor:pointer; }
	.generator-warning { padding:.55rem .65rem; border-left:3px solid #d5a35b; background:#332c26; color:#f3d9b2; line-height:1.4; }
	.generator-seed,.river-width { display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin:.6rem 0; }
	.generator-seed input { width:11rem; padding:.35rem; }
	.density-fields,.river-fields { margin:.75rem 0; padding:.6rem .75rem .75rem; border:1px solid #52647f; border-radius:5px; }
	.density-fields legend,.river-fields legend { padding:0 .35rem; color:#c8d7f3; font-weight:800; }
	.density-help { margin:.25rem 0 .65rem; color:#b8c5dc; font-size:.68rem; line-height:1.35; }
	.density-row { display:grid; grid-template-columns:8.5rem 1fr 2rem; align-items:center; gap:.7rem; margin:.55rem 0; }
	.density-row input { width:100%; accent-color:#8bb4e8; }
	.density-row output { text-align:right; font-variant-numeric:tabular-nums; }
	.river-enable { display:flex; align-items:center; gap:.5rem; }
	.river-direction { display:grid; grid-template-columns:1fr auto 1fr; align-items:end; gap:.6rem; margin:.7rem 0; }
	.river-direction label { display:grid; gap:.25rem; }
	.river-direction select,.river-width select { width:100%; padding:.35rem; }
	.generator-actions { display:flex; justify-content:flex-end; gap:.6rem; margin-top:1rem; }
	.generator-actions button { padding:.5rem .9rem; border:1px solid #7d8ca8; border-radius:4px; font:inherit; font-weight:800; cursor:pointer; }
	.generator-cancel { background:#28354b; color:#edf2ff; }
	.generator-submit { background:#315b85; border-color:#9bbbe5 !important; color:white; }
	.save-terrain { margin:.25rem 0 .75rem; }
	.library-empty { padding:.8rem; color:#b8c5dc; text-align:center; }
	.terrain-saved-list { display:grid; gap:.45rem; margin:.6rem 0; padding:0; list-style:none; }
	.terrain-saved-list li { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:.4rem; padding:.55rem; border:1px solid #52647f; border-radius:4px; }
	.terrain-saved-list li div { display:grid; gap:.2rem; min-width:0; }
	.terrain-saved-list small { color:#b8c5dc; }
	.terrain-saved-list button { padding:.35rem .55rem; border:1px solid #7d8ca8; border-radius:4px; background:#28354b; color:#edf2ff; font:inherit; cursor:pointer; }
	.terrain-saved-list .delete-saved { font-size:1.1rem; }

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
