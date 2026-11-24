<script lang="ts">
  import { onMount } from 'svelte';
  import { micropolisReactive } from '$lib/MicropolisReactive.svelte';

  let { onClose }: { onClose: () => void } = $props();
  let scenarioName = $state('');
  let selectedScenario = $state('');
  let status = $state('');
  let revision = $state(0);

  const slots = $derived.by(() => {
    void revision;
    return micropolisReactive.attachedSimulator?.listBrowserCitySaveSlots() ?? [];
  });
  const builtInCities = $derived(micropolisReactive.attachedSimulator?.cityFileNames ?? []);

  onMount(() => {
    const sim = micropolisReactive.attachedSimulator;
    const current = sim?.cityFileName ?? '';
    const saved = slots.find((slot) => slot.path === current);
    selectedScenario = saved?.id ?? current;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  function refresh(): void {
    revision += 1;
  }

  function saveCurrent(): void {
    try {
      const slot = micropolisReactive.attachedSimulator?.saveCurrentCityToBrowserSlot();
      if (!slot) throw new Error('Aucune ville active à sauvegarder.');
      selectedScenario = slot.id;
      scenarioName = slot.name;
      micropolisReactive.syncFromEngine();
      refresh();
      status = 'Carte « ' + slot.name + ' » sauvegardée dans ce navigateur.';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Échec de la sauvegarde.';
    }
  }

  function saveAs(): void {
    const name = scenarioName.trim();
    if (!name) { status = 'Saisissez un nom de scénario.'; return; }
    try {
      const sim = micropolisReactive.attachedSimulator;
      if (!sim) throw new Error('Aucune ville active à sauvegarder.');
      let slot;
      try {
        slot = sim.saveCityAsBrowserSlot(name, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('existe déjà')) throw error;
        if (!confirm('Remplacer le scénario « ' + name + ' » ?')) return;
        slot = sim.saveCityAsBrowserSlot(name, true);
      }
      selectedScenario = slot.id;
      micropolisReactive.syncFromEngine();
      refresh();
      status = 'Scénario « ' + slot.name + ' » enregistré.';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Échec de la sauvegarde.';
    }
  }

  function loadSelected(): void {
    const sim = micropolisReactive.attachedSimulator;
    if (!sim || !selectedScenario) return;
    try {
      const slot = slots.find((item) => item.id === selectedScenario);
      const builtIn = builtInCities.find((path) => path === selectedScenario);
      const loaded = slot
        ? sim.loadBrowserCitySaveSlot(slot.id)
        : builtIn ? sim.loadCity(builtIn) : false;
      if (!loaded) throw new Error('Impossible de charger ce scénario.');
      micropolisReactive.syncFromEngine();
      status = 'Scénario chargé.';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Échec du chargement.';
    }
  }
</script>

<div class="modal-backdrop">
  <dialog open class="scenario-modal" aria-modal="true" aria-labelledby="scenario-modal-title">
    <header>
      <div>
        <h2 id="scenario-modal-title">Scénarios · sauvegarder / charger</h2>
        <p>Les sauvegardes sont conservées localement dans ce navigateur.</p>
      </div>
      <button class="close" type="button" aria-label="Fermer" onclick={onClose}>×</button>
    </header>

    <section class="save-section">
      <h3>Sauvegarder la carte actuelle</h3>
      <button type="button" class="primary" onclick={saveCurrent}>Enregistrer la ville en cours</button>
      <div class="save-as">
        <label for="scenario-name">Enregistrer sous un nouveau nom</label>
        <input id="scenario-name" bind:value={scenarioName} placeholder="Nom du scénario" />
        <button type="button" onclick={saveAs} disabled={!scenarioName.trim()}>Enregistrer sous</button>
      </div>
    </section>

    <section class="load-section">
      <h3>Charger un scénario</h3>
      <label for="scenario-select">Scénarios disponibles</label>
      <select id="scenario-select" bind:value={selectedScenario}>
        <optgroup label="Sauvegardes locales">
          {#each slots as slot (slot.id)}
            <option value={slot.id}>{slot.name} · {new Date(slot.savedAt).toLocaleString('fr-FR')}</option>
          {/each}
        </optgroup>
        <optgroup label="Villes fournies avec le jeu">
          {#each builtInCities as path (path)}
            <option value={path}>{path.split('/').pop()?.replace(/\.cty$/i, '') ?? path}</option>
          {/each}
        </optgroup>
      </select>
      <button type="button" onclick={loadSelected} disabled={!selectedScenario}>Charger la sélection</button>
    </section>

    {#if status}<p class="status" role="status">{status}</p>{/if}
    <footer><button type="button" onclick={onClose}>Fermer</button></footer>
  </dialog>
</div>

<style>
  .modal-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 1rem; background: rgba(0,0,0,.68); }
  .scenario-modal { width: min(34rem, 100%); max-height: min(85vh, 46rem); overflow: auto; padding: 1rem; color: #edf2ff; background: #111a2a; border: 1px solid #72809b; border-radius: 10px; box-shadow: 0 18px 60px rgba(0,0,0,.55); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #46536b; padding-bottom: .75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  header p { margin: .35rem 0 0; color: #aebbd2; font-size: .82rem; }
  h3 { margin: 0 0 .65rem; font-size: .9rem; }
  .close { border: 0; background: transparent; color: white; font-size: 1.6rem; line-height: 1; cursor: pointer; }
  .save-section, .load-section { display: grid; gap: .6rem; padding: .9rem 0; border-bottom: 1px solid #46536b; }
  .save-as { display: grid; grid-template-columns: 1fr auto; gap: .45rem; }
  .save-as label { grid-column: 1 / -1; font-size: .8rem; color: #c4cde0; }
  input, select { min-width: 0; padding: .55rem; color: #f8fafc; background: #202c40; border: 1px solid #63718a; border-radius: 4px; }
  button { padding: .55rem .7rem; color: #f8fafc; background: #293c5b; border: 1px solid #7587a6; border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { background: #315b46; border-color: #70a88b; }
  .status { margin: .8rem 0 0; padding: .55rem; color: #ffe19a; background: rgba(255,193,64,.08); border-radius: 4px; font-size: .82rem; }
  footer { display: flex; justify-content: flex-end; padding-top: .8rem; }
  @media (max-width: 520px) { .save-as { grid-template-columns: 1fr; } }
</style>
