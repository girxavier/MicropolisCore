<script lang="ts">
	import { GAME_TOOL_GROUPS, toolMenuLabel, type ToolId } from '$lib/gameTools';
	import { toolState } from '$lib/ToolState.svelte';
	import { editorModeState } from '$lib/EditorMode.svelte';
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { commandBus } from '$lib/CommandBus';

	function selectTool(id: ToolId) {
		toolState.setActiveTool(id);
	}

	function toggleEditorMode() {
		const next = !editorModeState.active;
		editorModeState.set(next);
		if (next) micropolisReactive.attachedSimulator?.enterEditorMode();
		else micropolisReactive.attachedSimulator?.exitEditorMode();
	}
</script>

<nav class="toolbar" aria-label="City tools">
	<button type="button" class="mode-toggle" class:active={editorModeState.active} onclick={toggleEditorMode}>
		{editorModeState.active ? 'REPRENDRE LE JEU' : 'MODE MAQUETTISTE'}
	</button>
	{#if editorModeState.active}
		<div class="tool-group-label">Historique</div>
		<button type="button" class="tool-item" onclick={() => commandBus.undo()}>↶ Annuler (Ctrl+Z)</button>
		<button type="button" class="tool-item" onclick={() => commandBus.redo()}>↷ Rétablir (Ctrl+Y)</button>
		{#each GAME_TOOL_GROUPS as group (group.id)}
			<details class="tool-category" open={group.id === 'terrain'}>
				<summary>{group.label ?? group.id}</summary>
				{#each group.tools as tool (tool.id)}
					<button type="button" class="tool-item" class:active={toolState.activeToolId === tool.id}
						title="{tool.shortcut}: {toolMenuLabel(tool)}" onclick={() => selectTool(tool.id)}>
						<span class="tool-key">{tool.shortcut}:</span><span class="tool-name">{toolMenuLabel(tool)}</span>
					</button>
				{/each}
			</details>
		{/each}
	{:else}
		<div class="tool-group-label">Vitesse du jeu</div>
		{#each [{ index: 0, label: 'Lente · 58 s/mois' }, { index: 1, label: 'Normale · 29 s/mois' }, { index: 2, label: 'Rapide · 15 s/mois' }] as speed}
			<button type="button" class="tool-item" onclick={() => { const sim = micropolisReactive.attachedSimulator; sim?.setGameSpeed(speed.index); sim?.setPaused(false); }}>
				<span class="tool-key">{speed.index + 1}:</span><span class="tool-name">{speed.label}</span>
			</button>
		{/each}
		{#each GAME_TOOL_GROUPS.filter((group) => group.id !== 'terrain') as group (group.id)}
			{#if group.label}<div class="tool-group-label">{group.label}</div>{/if}
			{#each group.tools as tool (tool.id)}
				<button type="button" class="tool-item" class:active={toolState.activeToolId === tool.id}
					title="{tool.shortcut}: {toolMenuLabel(tool)}" onclick={() => selectTool(tool.id)}>
					<span class="tool-key">{tool.shortcut}:</span><span class="tool-name">{toolMenuLabel(tool)}</span>
				</button>
			{/each}
		{/each}
	{/if}
</nav>

<style>
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
</style>
