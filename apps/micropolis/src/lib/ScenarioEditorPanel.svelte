<script lang="ts">
  import { onMount } from 'svelte';
  import { micropolisReactive } from '$lib/MicropolisReactive.svelte';
  import { editorModeState } from '$lib/EditorMode.svelte';
  import catalog from '../../../../content/micropolis/smcity/construction-types.json';
  import { resolveConstructionTypeFromTileId } from '$lib/smcity/constructionCatalog';
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
  const typeOptions = $derived(categories.flatMap((category) => {
    const regular = (category.types ?? []).map((row) => ({ id: row.id, label: row.label, climateIndex: row.climateIndex ?? null }));
    if (category.id !== 'A') return regular;
    const agricultural = (category.specializations ?? []).flatMap((specialization) =>
      (category.scales ?? []).flatMap((scale) => (category.productionModes ?? []).map((mode) => ({
        id: `A.${specialization.id}.${scale.id}.${mode}`,
        label: `${specialization.label} · ${scale.id} · ${mode}`,
        climateIndex: specialization.climateIndexByScale?.[scale.id]?.[mode] ?? specialization.climateIndex ?? null
      })))
    );
    return [...regular, ...agricultural];
  }));
  let scenarioData = $state<ScenarioData>(createEmptyScenarioData('default'));
  let loadedScenarioId = $state('');
  let selectedTypeId = $state('R.D1');
  let propertyName = $state('climateIndex');
  let propertyValue = $state('');
  let status = $state('');
  let scenarioId = $derived(micropolisReactive.cityFileName || 'default');
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
  .editor-fields { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; }
  label { display:grid; gap:.2rem; min-width:0; color:#cbd5e1; }
  input,select,button { min-width:0; box-sizing:border-box; padding:.4rem; color:#f8fafc; background:#1e293b; border:1px solid #64748b; border-radius:3px; font:inherit; }
  button { cursor:pointer; }
  .shared-note { line-height:1.4; }
  .status { color:#fde68a; }
  pre { white-space:pre-wrap; overflow-wrap:anywhere; }
  @media(max-width:700px) { .scenario-editor { top:3rem; max-height:45%; } .editor-fields { grid-template-columns:1fr; } }
</style>
