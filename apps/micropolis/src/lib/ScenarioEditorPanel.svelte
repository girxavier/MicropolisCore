<script lang="ts">
  import { onMount } from 'svelte';
  import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
  import { editorModeState } from '$lib/EditorMode.svelte';
  import catalog from '../../../../content/micropolis/smcity/construction-types.json';
  import { getAgriculturalClimateRule, getConstructionClimateRule, resolveConstructionTypeFromTileId } from '$lib/smcity/constructionCatalog';
  import {
    createEmptyScenarioData,
    exportScenarioSave,
    loadScenarioData,
    saveScenarioData,
    updateScenarioTypeProperty,
    type ScenarioData,
    type ScenarioPropertyValue
  } from '$lib/smcity/scenarioData';

  type CatalogRow = { id: string; label: string; climateIndex?: number | null; climateIndexByScale?: Record<string, Record<string, number>> };
  type CatalogCategory = { id: string; label: string; types?: CatalogRow[]; specializations?: CatalogRow[]; scales?: { id: string; label: string }[]; productionModes?: string[] };
  const categories = (catalog as { categories: CatalogCategory[]; commonProperties: string[] }).categories;
  const commonProperties = (catalog as { commonProperties: string[] }).commonProperties;
  function defaultClimateIndex(rule: ReturnType<typeof getConstructionClimateRule>): number | null {
    return rule.kind === 'fixed' ? rule.value : rule.kind === 'range' ? (rule.min + rule.max) / 2 : null;
  }
  const typeOptions = $derived(categories.flatMap((category) => {
    const regular = (category.types ?? []).map((row) => ({ id: row.id, label: row.label, climateIndex: defaultClimateIndex(getConstructionClimateRule(row.id)) }));
    if (category.id !== 'A') return regular;
    const agricultural = (category.specializations ?? []).flatMap((specialization) =>
      (category.scales ?? []).flatMap((scale) => (category.productionModes ?? []).map((mode) => {
        const id = `A.${specialization.id}.${scale.id}.${mode}`;
        return { id, label: `${specialization.label} · ${scale.id} · ${mode}`, climateIndex: defaultClimateIndex(getAgriculturalClimateRule(specialization.id, scale.id, mode)) };
      }))
    );
    return [...regular, ...agricultural];
  }));
  let scenarioData = $state<ScenarioData>(createEmptyScenarioData('default'));
  let loadedScenarioId = $state('');
  let selectedTypeId = $state('R.D1');
  let propertyName = $state('climateIndex');
  let propertyValue = $state('');
  let status = $state('');
  let newScenarioName = $state('');
  let selectedExistingScenario = $state('');
  let saveSlotsRevision = $state(0);
  let saveSlots = $derived.by(() => {
    void saveSlotsRevision;
    const sim = micropolisReactive.attachedSimulator;
    const saved = sim?.listBrowserCitySaveSlots() ?? [];
    const builtIn = micropolisReactive.cityFileNames.map((path) => ({ id: path.split('/').pop()?.replace(/\.cty$/i, '') ?? path, name: path.split('/').pop()?.replace(/\.cty$/i, '') ?? path, path, savedAt: '' }));
    return Array.from(new Map([...builtIn, ...saved].map((slot) => [slot.id.toLowerCase(), slot])).values());
  });
  let scenarioId = $derived(micropolisReactive.cityFileName || micropolisReactive.cityName || 'default');
  let queriedTile = $derived(micropolisReactive.zoneStatus.visible ? micropolisReactive.zoneStatus : null);
  let selectedType = $derived(typeOptions.find((row) => row.id === selectedTypeId));
  let currentProperties = $derived(scenarioData.constructionTypes[selectedTypeId] ?? {});
  let currentValue = $derived(currentProperties[propertyName] ?? selectedType?.climateIndex ?? '');

  onMount(() => {
    scenarioData = loadScenarioData(scenarioId);
    loadedScenarioId = scenarioId;
  });

  $effect(() => {
    const nextScenarioId = scenarioId;
    if (nextScenarioId && nextScenarioId !== loadedScenarioId) {
      scenarioData = loadScenarioData(nextScenarioId);
      loadedScenarioId = nextScenarioId;
      status = `Tables du scénario « ${scenarioData.scenarioId} » chargées.`;
    }
  });

  $effect(() => {
    const selection = queriedTile;
    if (!selection) return;
    const typeId = resolveConstructionTypeFromTileId(selection.tileId);
    if (typeId) {
      selectedTypeId = typeId;
      propertyValue = String(scenarioData.constructionTypes[typeId]?.[propertyName] ?? typeOptions.find((row) => row.id === typeId)?.climateIndex ?? '');
    }
  });

  function changeScenario(): void {
    scenarioData = loadScenarioData(scenarioId);
    status = `Tables du scénario « ${scenarioData.scenarioId} » chargées.`;
  }

  function applyProperty(): void {
    let parsed: ScenarioPropertyValue = propertyValue.trim();
    if (parsed === '') parsed = null;
    else if (parsed === 'true') parsed = true;
    else if (parsed === 'false') parsed = false;
    else if (!Number.isNaN(Number(parsed))) parsed = Number(parsed);
    try {
      scenarioData = updateScenarioTypeProperty(scenarioData, selectedTypeId, propertyName, parsed);
      saveScenarioData(scenarioData);
      status = `Valeur enregistrée pour toutes les constructions de type ${selectedTypeId}.`;
    } catch (error) {
      status = error instanceof Error ? error.message : 'Impossible d’enregistrer cette valeur.';
    }
  }

  function exportSave(): void {
    try {
      exportScenarioSave({
        format: 'smcity-scenario-save',
        version: 1,
        scenario: scenarioData,
        game: {
          cityFileName: micropolisReactive.cityFileName,
          cityName: micropolisReactive.cityName,
          cityYear: micropolisReactive.cityYear,
          cityMonth: micropolisReactive.cityMonth
        }
      });
      status = 'Tables et métadonnées du scénario exportées ; la carte et l’état complet de la simulation ne sont pas inclus.';
    } catch (error) {
      status = error instanceof Error ? error.message : 'Échec de l’export.';
    }
  }

  function refreshValue(): void {
    propertyValue = String(currentValue ?? '');
  }

  function saveCurrentMap(): void {
    try {
      const slot = micropolisReactive.attachedSimulator?.saveCurrentCityToBrowserSlot();
      if (!slot) throw new Error('Aucune ville active à sauvegarder.');
      micropolisReactive.syncFromEngine();
      scenarioData = { ...scenarioData, scenarioId: slot.id };
      saveScenarioData(scenarioData);
      micropolisReactive.refreshCityClimateIndex();
      saveSlotsRevision += 1;
      status = `Carte « ${slot.name} » sauvegardée dans ce navigateur.`;
    } catch (error) { status = error instanceof Error ? error.message : 'Échec de la sauvegarde.'; }
  }

  function saveAsExistingScenario(): void {
    if (!selectedExistingScenario) return;
    const slot = saveSlots.find((item) => item.id === selectedExistingScenario);
    const label = slot?.name ?? selectedExistingScenario;
    if (!confirm(`Remplacer la carte du scénario « ${label} » ?`)) return;
    try {
      const saved = micropolisReactive.attachedSimulator?.saveCityAsBrowserSlot(label, true);
      if (!saved) throw new Error('Aucun simulateur disponible.');
      micropolisReactive.syncFromEngine();
      scenarioData = { ...scenarioData, scenarioId: saved.id };
      saveScenarioData(scenarioData);
      micropolisReactive.refreshCityClimateIndex();
      saveSlotsRevision += 1;
      status = `Carte enregistrée sous le scénario « ${saved.name} ».`;
    } catch (error) { status = error instanceof Error ? error.message : 'Échec de la sauvegarde.'; }
  }

  function createScenario(): void {
    const name = newScenarioName.trim();
    if (!name) { status = 'Donnez un nom au nouveau scénario.'; return; }
    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
    const exists = saveSlots.some((slot) => slot.id.toLowerCase() === id);
    if (exists && !confirm(`Le scénario « ${name} » existe déjà. Le remplacer ?`)) return;
    try {
      const saved = micropolisReactive.attachedSimulator?.saveCityAsBrowserSlot(name, exists);
      if (!saved) throw new Error('Aucun simulateur disponible.');
      micropolisReactive.syncFromEngine();
      scenarioData = createEmptyScenarioData(saved.id);
      saveScenarioData(scenarioData);
      micropolisReactive.attachedSimulator?.micropolis?.clearZoneLocks();
      micropolisReactive.refreshCityClimateIndex();
      newScenarioName = '';
      selectedExistingScenario = saved.id;
      saveSlotsRevision += 1;
      status = `Nouveau scénario « ${saved.name} » créé avec la carte actuelle.`;
    } catch (error) { status = error instanceof Error ? error.message : 'Échec de la création du scénario.'; }
  }

  function loadSelectedScenario(): void {
    if (!selectedExistingScenario) return;
    try {
      const loaded = micropolisReactive.attachedSimulator?.loadBrowserCitySaveSlot(selectedExistingScenario);
      if (!loaded) throw new Error('Cette entrée est un scénario intégré ou aucune sauvegarde locale ne lui est associée.');
      micropolisReactive.syncFromEngine();
      scenarioData = loadScenarioData(selectedExistingScenario);
      loadedScenarioId = selectedExistingScenario;
      micropolisReactive.refreshCityClimateIndex();
      status = `Scénario « ${selectedExistingScenario} » chargé.`;
    } catch (error) { status = error instanceof Error ? error.message : 'Échec du chargement.'; }
  }
</script>

{#if editorModeState.active}
  <section class="scenario-editor" aria-label="Éditeur des propriétés de construction">
    <header>
      <div>
        <strong>DONNÉES DU SCÉNARIO</strong>
        <small>Les valeurs sont communes à toutes les occurrences d’un même type.</small>
        {#if queriedTile}<small>Dernière sélection QUERY : case {queriedTile.x}, {queriedTile.y} · tuile {queriedTile.tileId & 0x03ff}</small>{/if}
      </div>
      <button type="button" onclick={exportSave}>Exporter les tables</button>
    </header>
    <section class="save-panel" aria-label="Sauvegarde des scénarios">
      <div class="save-heading"><strong>SAUVEGARDER LA CARTE</strong><small>La carte .cty et les tables du scénario sont conservées dans ce navigateur.</small></div>
      <button class="save-primary" type="button" onclick={saveCurrentMap}>Sauvegarder la map en cours</button>
      <div class="save-row">
        <label>Scénario existant
          <select bind:value={selectedExistingScenario}>
            <option value="">Choisir un scénario…</option>
            {#each saveSlots as slot}<option value={slot.id}>{slot.name}</option>{/each}
          </select>
        </label>
        <div class="save-actions"><button type="button" onclick={saveAsExistingScenario} disabled={!selectedExistingScenario}>Enregistrer sous…</button><button type="button" onclick={loadSelectedScenario} disabled={!selectedExistingScenario || !saveSlots.find((slot) => slot.id === selectedExistingScenario)?.savedAt}>Charger</button></div>
      </div>
      <div class="save-row">
        <label>Créer un scénario ex nihilo
          <input bind:value={newScenarioName} placeholder="Nom du nouveau scénario" />
        </label>
        <button type="button" onclick={createScenario} disabled={!newScenarioName.trim()}>Créer</button>
      </div>
    </section>
    <div class="editor-fields">
      <label>
        Scénario / ville
        <input value={scenarioData.scenarioId} readonly />
      </label>
      <label>
        Type de construction
        <select bind:value={selectedTypeId} onchange={refreshValue}>
          {#each categories as category}
            <optgroup label={category.label}>
              {#each category.types ?? [] as row}
                <option value={row.id}>{row.label}</option>
              {/each}
              {#if category.id === 'A'}
                {#each typeOptions.filter((row) => row.id.startsWith('A.')) as row}
                  <option value={row.id}>{row.label}</option>
                {/each}
              {/if}
            </optgroup>
          {/each}
        </select>
      </label>
      <label>
        Propriété
        <select bind:value={propertyName} onchange={refreshValue}>
          {#each commonProperties as property}
            <option value={property}>{property}</option>
          {/each}
        </select>
      </label>
      <label>
        Valeur (nombre, texte, true/false ou vide)
        <input bind:value={propertyValue} placeholder={String(currentValue ?? 'Non définie')} />
      </label>
      <button type="button" onclick={applyProperty}>Appliquer à tout le type</button>
    </div>
    <p class="shared-note">Sélectionner une construction avec QUERY identifie automatiquement les zones résidentielles prises en charge. La table modifiée est partagée : aucun réglage individuel n’est créé pour cette occurrence. Les types non encore reliés au catalogue peuvent être choisis dans la liste.</p>
    {#if status}<p class="status" role="status">{status}</p>{/if}
    <details>
      <summary>Valeurs spécifiques déjà enregistrées</summary>
      <pre>{JSON.stringify(scenarioData.constructionTypes, null, 2)}</pre>
    </details>
  </section>
{/if}

<style>
  .scenario-editor { position:absolute; z-index:28; top:0.65rem; right:0.65rem; width:min(32rem,calc(100% - 1.3rem)); max-height:55%; overflow:auto; padding:0.75rem; color:#f1f5f9; background:rgba(10,16,28,.96); border:1px solid #64748b; border-radius:.4rem; box-shadow:0 4px 18px #0008; font:12px ui-monospace,monospace; }
  header { display:flex; justify-content:space-between; gap:.6rem; align-items:flex-start; margin-bottom:.7rem; }
  header div { display:grid; gap:.25rem; } small,.shared-note { color:#cbd5e1; }
  .save-panel { display:grid; gap:.55rem; margin:.2rem 0 .8rem; padding:.65rem; border:1px solid #52647f; border-radius:5px; background:linear-gradient(135deg,rgba(34,52,77,.95),rgba(17,28,45,.95)); }
  .save-heading { display:grid; gap:.2rem; }
  .save-heading small { color:#b9c9dc; }
  .save-primary { background:#17634f; border-color:#4ab89a; font-weight:800; padding:.55rem; }
  .save-row { display:grid; grid-template-columns:1fr auto; gap:.5rem; align-items:end; }
  .save-row label { display:grid; gap:.2rem; color:#cbd5e1; }
  .save-actions { display:flex; gap:.25rem; }
  .save-row button { min-height:2rem; background:#334b6c; border-color:#8aa5c8; }
  .save-row button:disabled { opacity:.45; cursor:not-allowed; }
  .editor-fields { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; }
  label { display:grid; gap:.2rem; min-width:0; color:#cbd5e1; }
  input,select,button { min-width:0; box-sizing:border-box; padding:.4rem; color:#f8fafc; background:#1e293b; border:1px solid #64748b; border-radius:3px; font:inherit; }
  button { cursor:pointer; }
  .shared-note { line-height:1.4; }
  .status { color:#fde68a; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; }
  @media(max-width:700px) { .scenario-editor { top:3rem; max-height:45%; } .editor-fields { grid-template-columns:1fr; } }
</style>
