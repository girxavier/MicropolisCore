<script lang="ts">
	import type { PageServerData } from './$types';
	let { data }: { data: PageServerData } = $props();
	const pageHeadTitle = $derived(data?.node?.title ?? 'Micropolis');
	const pageDescription = $derived(data?.node?.description ?? '');
</script>

<svelte:head>
	<title>{pageHeadTitle}</title>
	{#if pageDescription}
		<meta name="description" content={pageDescription} />
	{/if}
</svelte:head>

<div class="hub">
	<p class="lede">
		Experimental playground for <strong>Micropolis</strong> (city tiles / WASM) and <strong>The Sims</strong> mesh
		animation (VitaMoo). Shared chrome, pie menus, and tabbed windows will grow from here.
	</p>

	<div class="editor-entry">
		<a href="/play/micropolis?mode=edit" class="editor-button">
			<span class="editor-title">MODE MAQUETTISTE</span>
			<span class="editor-desc">Construire une ville librement, sans budget ni passage du temps</span>
		</a>
	</div>

	<ul class="cards">
		<li>
			<a href="/play/micropolis" class="card micropolis">
				<span class="card-title">Micropolis City</span>
				<span class="card-desc">Pan and zoom the tile engine; WebGL / WebGPU renderers.</span>
			</a>
		</li>
		<li>
			<a href="/play/sims" class="card sims">
				<span class="card-title">The Sims</span>
				<span class="card-desc">VitaMoo character demo — WebGPU, mooshow (embed in progress).</span>
			</a>
		</li>
	</ul>
</div>

<style>
	.hub {
		max-width: 44rem;
		margin: 0 auto;
		padding: 1rem 0 2rem;
	}

	.lede {
		font-size: 1.05rem;
		line-height: 1.55;
		margin: 0 0 1.5rem;
	}

	.editor-entry { margin: 0 0 1rem; }
	.editor-button {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 1.4rem 1.5rem;
		border: 3px solid #c68a36;
		border-radius: 10px;
		background: linear-gradient(135deg, #49351f, #1d2938);
		color: #fff;
		text-decoration: none;
		box-shadow: 0 4px 14px rgba(0,0,0,.22);
	}
	.editor-button:hover { transform: translateY(-2px); border-color: #f1c36d; }
	.editor-title { font-size: 1.45rem; font-weight: 900; letter-spacing: .04em; }
	.editor-desc { font-size: .98rem; line-height: 1.4; }

	.cards {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
		grid-template-columns: 1fr;
	}

	@media (min-width: 520px) {
		.cards {
			grid-template-columns: 1fr 1fr;
		}
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1rem 1.1rem;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		min-height: 6.5rem;
		border: 2px solid rgba(0, 0, 0, 0.12);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}

	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
	}

	.card.micropolis {
		border-color: var(--rci-R-green, #00c000);
		background: linear-gradient(145deg, rgba(0, 192, 0, 0.08), transparent 55%);
	}

	.card.sims {
		border-color: var(--rci-C-blue, #0080ff);
		background: linear-gradient(145deg, rgba(0, 128, 255, 0.08), transparent 55%);
	}

	.card-title {
		font-weight: 700;
		font-size: 1.15rem;
	}

	.card-desc {
		font-size: 0.92rem;
		line-height: 1.45;
		opacity: 0.92;
	}
</style>
