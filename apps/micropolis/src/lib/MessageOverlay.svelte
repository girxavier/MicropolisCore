<script lang="ts">
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { messageText } from '$lib/engineMessages';

	const DEFAULT_MESSAGE = 'Welcome to Micropolis.';
	let expanded = $state(false);
	let historyOpen = $state(false);

	const publication = $derived(micropolisReactive.climatePublication);
	const publicationHistory = $derived(micropolisReactive.climatePublicationHistory);
	const displayText = $derived(
		micropolisReactive.messageIndex >= 0
			? messageText(micropolisReactive.messageIndex)
			: DEFAULT_MESSAGE,
	);
	const showCoords = $derived(
		micropolisReactive.messageIndex >= 0 && micropolisReactive.messageX >= 0,
	);

	function dismissPublication(): void {
		if (!publication) return;
		micropolisReactive.dismissClimatePublication(publication.id);
		expanded = false;
	}
</script>

{#if publication}
	<div class="publication-stack">
		<div
			class="message-bar climate-publication"
			class:important={publication.important}
			aria-live="polite"
			role="status"
		>
			<span class="publication-tag">MÉTÉO</span>
			<button class="message-text publication-preview" type="button" onclick={() => expanded = !expanded} aria-expanded={expanded}>
				{publication.text}
			</button>
			<button class="message-action" type="button" onclick={() => expanded = !expanded}>{expanded ? 'Réduire' : 'Détails'}</button>
			<button class="message-action" type="button" onclick={() => historyOpen = !historyOpen}>Historique</button>
			<button class="message-close" type="button" onclick={dismissPublication} aria-label="Fermer la publication">×</button>
		</div>
		{#if expanded}
			<section class="publication-detail" aria-label="Détail de la publication météo">
				<strong>{publication.title}</strong>
				<p>{publication.detail}</p>
				<small>Publication climatique · {new Date(publication.publishedAt).toLocaleString('fr-FR')}</small>
			</section>
		{/if}
		{#if historyOpen}
			<section class="publication-history" aria-label="Historique des publications météo">
				<strong>Historique météo</strong>
				{#if publicationHistory.length === 0}
					<p>Aucune publication enregistrée.</p>
				{:else}
					{#each publicationHistory.slice(0, 10) as item (item.id)}
						<article class="history-item">
							<strong>{item.title}</strong>
						<span>{item.text}</span>
						<small>{new Date(item.publishedAt).toLocaleString('fr-FR')}</small>
					</article>
					{/each}
				{/if}
			</section>
		{/if}
	</div>
{:else}
	<div
		class="message-bar"
		class:important={micropolisReactive.messageImportant}
		aria-live="polite"
		role="status"
	>
		<span class="message-text">{displayText}</span>
		{#if showCoords}
			<span class="coords">({micropolisReactive.messageX}, {micropolisReactive.messageY})</span>
		{/if}
	</div>
{/if}

<style>
	.publication-stack {
		position: relative;
		z-index: 25;
		flex-shrink: 0;
		width: 100%;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.message-bar {
		flex-shrink: 0;
		z-index: 25;
		height: var(--message-bar-height, 2.5rem);
		min-height: var(--message-bar-height, 2.5rem);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0 0.75rem;
		box-sizing: border-box;
		background: rgba(20, 24, 36, 0.94);
		border-top: 1px solid rgba(255, 255, 255, 0.18);
		color: #f5f5f5;
		font-size: 0.78rem;
		line-height: 1.25;
		text-align: center;
		pointer-events: auto;
	}
	.message-bar.important {
		border-top-color: rgba(255, 120, 80, 0.75);
		background: rgba(48, 16, 12, 0.96);
	}
	.publication-tag {
		flex: 0 0 auto;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: #9ed8ff;
	}
	.message-text {
		flex: 0 1 auto;
	}
	.publication-preview {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.message-action, .message-close {
		flex: 0 0 auto;
		border: 1px solid rgba(255,255,255,.25);
		border-radius: 3px;
		padding: .18rem .4rem;
		background: rgba(255,255,255,.08);
		color: #fff;
		font: inherit;
		font-size: .68rem;
		cursor: pointer;
	}
	.message-close {
		font-size: .9rem;
		line-height: 1;
	}
	.message-action:hover, .message-close:hover { background: rgba(255,255,255,.18); }
	.publication-detail, .publication-history {
		padding: .65rem .9rem;
		background: rgba(8, 12, 20, .96);
		border-top: 1px solid rgba(255,255,255,.16);
		color: #eef2ff;
		font-size: .75rem;
	}
	.publication-detail p { margin: .35rem 0; color: #d3deef; }
	.publication-detail small, .history-item small { color: #9caec7; }
	.publication-history {
		max-height: 13rem;
		overflow-y: auto;
		display: grid;
		gap: .45rem;
	}
	.publication-history > strong { color: #9ed8ff; }
	.history-item {
		display: grid;
		gap: .15rem;
		padding: .35rem 0;
		border-top: 1px solid rgba(255,255,255,.1);
	}
	.history-item span { color: #d3deef; }
	.coords {
		flex: 0 0 auto;
		font-size: 0.72rem;
		color: #ffc840;
	}
</style>
