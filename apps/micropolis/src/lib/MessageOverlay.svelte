<script lang="ts">
	import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
	import { messageText } from '$lib/engineMessages';

	let expanded = $state(false);
	let dismissedEngineMessage = $state(false);

	const publication = $derived(micropolisReactive.climatePublication);
	const displayText = $derived(
		micropolisReactive.messageIndex >= 0
			? messageText(micropolisReactive.messageIndex)
			: '',
	);
	const showEngineMessage = $derived(micropolisReactive.messageIndex >= 0 && !dismissedEngineMessage);
	const hasMessage = $derived(!!publication || showEngineMessage);

	$effect(() => {
		const publicationId = publication?.id;
		const messageIndex = micropolisReactive.messageIndex;
		if (publicationId || messageIndex >= 0) {
			expanded = false;
			dismissedEngineMessage = false;
		}
	});

	function dismissMessage(): void {
		if (publication) {
			micropolisReactive.dismissClimatePublication(publication.id);
		} else {
			dismissedEngineMessage = true;
		}
		expanded = false;
	}
</script>

{#if hasMessage}
	<div class="publication-stack">
		<div
			class="message-bar"
			class:important={publication?.important ?? micropolisReactive.messageImportant}
			aria-live="polite"
			role="status"
		>
			{#if publication}
				<span class="publication-tag">MÉTÉO · {publication.title}</span>
				<button class="message-text publication-preview" type="button" onclick={() => expanded = !expanded} aria-expanded={expanded}>
					{publication.text}
				</button>
				{#if expanded}
					<section class="publication-detail" aria-label="Détail du bulletin météo">
						<p>{publication.detail}</p>
					</section>
				{/if}
			{:else}
				<span class="message-text">{displayText}</span>
			{/if}
			<button class="message-close" type="button" onclick={dismissMessage} aria-label="Fermer le message" title="Fermer le message">×</button>
		</div>
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
		min-height: var(--message-bar-height, 2.5rem);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0.35rem 0.75rem;
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
		max-width: 13rem;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: #9ed8ff;
	}
	.message-text {
		flex: 0 1 auto;
		min-width: 0;
	}
	.publication-preview {
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
	.message-close {
		flex: 0 0 auto;
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid rgba(255,255,255,.35);
		border-radius: 4px;
		background: rgba(255,255,255,.12);
		color: #fff;
		font: inherit;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
	}
	.message-close:hover { background: rgba(255,255,255,.28); }
	.publication-detail {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		padding: .55rem .9rem;
		background: rgba(8, 12, 20, .96);
		border: 1px solid rgba(255,255,255,.16);
		color: #d3deef;
		font-size: .75rem;
		text-align: left;
	}
	.publication-detail p { margin: 0; }
	@media (max-width: 700px) {
		.message-bar { justify-content: flex-start; gap: .4rem; font-size: .7rem; }
		.publication-tag { max-width: 8rem; }
	}
</style>
