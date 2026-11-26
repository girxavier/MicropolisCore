import referenceCatalog from '../../../../../content/micropolis/smcity/construction-types.json';

export type ScenarioPropertyValue = number | string | boolean | null;
export type ConstructionProperties = Record<string, ScenarioPropertyValue>;
export interface AgriculturalZone {
  id: string;
  x: number;
  y: number;
  level: number;
  monthsInStage: number;
  specialization: 'MAR';
  productionMode: 'BIO' | 'CONV';
}
export interface ScenarioData {
  schemaVersion: 1;
  scenarioId: string;
  updatedAt: string;
  constructionTypes: Record<string, ConstructionProperties>;
  monthlyClimateIndices: Record<string, number>;
  lockedZones: Record<string, boolean>;
  agriculturalZones: Record<string, AgriculturalZone>;
}
export interface ScenarioSaveBundle {
  format: 'smcity-scenario-save';
  version: 1;
  scenario: ScenarioData;
  game: {
    cityFileName: string;
    cityName: string;
    cityYear: number;
    cityMonth: number;
  };
}

const STORAGE_PREFIX = 'smcity:scenario-data:v1:';
const commonProperties = (referenceCatalog as { commonProperties: string[] }).commonProperties;

export function createEmptyScenarioData(scenarioId: string): ScenarioData {
  return { schemaVersion: 1, scenarioId, updatedAt: new Date(0).toISOString(), constructionTypes: {}, monthlyClimateIndices: {}, lockedZones: {}, agriculturalZones: {} };
}

export function normalizeScenarioId(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  return normalized.replace(/\.(cty|mop|json)$/i, '').toLowerCase() || 'default';
}

export function recordMonthlyClimateIndex(data: ScenarioData, year: number, month: number, index: number): ScenarioData {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 || !Number.isFinite(index)) {
    throw new RangeError('Invalid monthly climate record');
  }
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  return { ...data, updatedAt: new Date().toISOString(), monthlyClimateIndices: { ...data.monthlyClimateIndices, [key]: index } };
}

export function getAnnualClimateIndices(data: ScenarioData, year: number): number[] | null {
  const values = Array.from({ length: 12 }, (_, month) => data.monthlyClimateIndices?.[`${year}-${String(month + 1).padStart(2, '0')}`]);
  return values.every((value): value is number => typeof value === 'number') ? values : null;
}

export function updateScenarioZoneLock(data: ScenarioData, x: number, y: number, locked: boolean): ScenarioData {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) throw new RangeError('Invalid zone coordinates');
  const key = `${x},${y}`;
  const lockedZones = { ...(data.lockedZones ?? {}) };
  if (locked) lockedZones[key] = true;
  else delete lockedZones[key];
  return { ...data, updatedAt: new Date().toISOString(), lockedZones };
}

export function getScenarioZoneLock(data: ScenarioData, x: number, y: number): boolean {
  return data.lockedZones?.[`${x},${y}`] === true;
}

export function getScenarioTypeProperties(data: ScenarioData, typeId: string): ConstructionProperties {
  return { ...(data.constructionTypes[typeId] ?? {}) };
}

export function resetScenarioTypeProperties(data: ScenarioData, typeId: string): ScenarioData {
  if (!typeId.trim()) throw new Error('A construction type is required');
  const constructionTypes = { ...data.constructionTypes };
  delete constructionTypes[typeId];
  return { ...data, updatedAt: new Date().toISOString(), constructionTypes };
}

export function updateScenarioTypeProperty(
  data: ScenarioData,
  typeId: string,
  property: string,
  value: ScenarioPropertyValue
): ScenarioData {
  if (!typeId.trim()) throw new Error('A construction type is required');
  if (!commonProperties.includes(property)) throw new Error(`Unsupported construction property: ${property}`);
  if (property === 'climateIndex' && typeof value === 'number' && (!Number.isFinite(value) || value < -100 || value > 100)) {
    throw new RangeError('climateIndex must be between -100 and +100');
  }
  return {
    ...data,
    updatedAt: new Date().toISOString(),
    constructionTypes: {
      ...data.constructionTypes,
      [typeId]: { ...(data.constructionTypes[typeId] ?? {}), [property]: value }
    }
  };
}

export function upsertAgriculturalZone(data: ScenarioData, zone: AgriculturalZone): ScenarioData {
  if (!Number.isInteger(zone.x) || !Number.isInteger(zone.y) || zone.x < 1 || zone.y < 1 ||
      !Number.isInteger(zone.level) || zone.level < 0 || zone.level > 5 ||
      !Number.isInteger(zone.monthsInStage) || zone.monthsInStage < 0 || zone.monthsInStage > 11) {
    throw new RangeError('Invalid agricultural zone');
  }
  const id = `${zone.x},${zone.y}`;
  return { ...data, updatedAt: new Date().toISOString(), agriculturalZones: { ...(data.agriculturalZones ?? {}), [id]: { ...zone, id } } };
}

export function removeAgriculturalZone(data: ScenarioData, x: number, y: number): ScenarioData {
  const agriculturalZones = { ...(data.agriculturalZones ?? {}) };
  delete agriculturalZones[`${x},${y}`];
  return { ...data, updatedAt: new Date().toISOString(), agriculturalZones };
}

/** Advance each active farm by one simulated month; one development stage takes 12 months. */
export function advanceAgriculturalDevelopment(data: ScenarioData): ScenarioData {
  const current = data.agriculturalZones ?? {};
  if (Object.keys(current).length === 0) return data;
  let changed = false;
  const agriculturalZones: Record<string, AgriculturalZone> = {};
  for (const [key, zone] of Object.entries(current)) {
    if (zone.level >= 5) { agriculturalZones[key] = zone; continue; }
    const elapsed = zone.monthsInStage + 1;
    agriculturalZones[key] = elapsed >= 12
      ? { ...zone, level: zone.level + 1, monthsInStage: 0 }
      : { ...zone, monthsInStage: elapsed };
    changed = true;
  }
  return changed ? { ...data, updatedAt: new Date().toISOString(), agriculturalZones } : data;
}

export function serializeScenarioSave(bundle: ScenarioSaveBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseScenarioSave(serialized: string): ScenarioSaveBundle {
  const parsed = JSON.parse(serialized) as Partial<ScenarioSaveBundle>;
  if (parsed.format !== 'smcity-scenario-save' || parsed.version !== 1 ||
      !parsed.scenario || parsed.scenario.schemaVersion !== 1 ||
      typeof parsed.scenario.scenarioId !== 'string' ||
      !parsed.scenario.constructionTypes || typeof parsed.scenario.constructionTypes !== 'object' ||
      !parsed.game || typeof parsed.game.cityFileName !== 'string') {
    throw new Error('Invalid SmCity scenario save');
  }
  return parsed as ScenarioSaveBundle;
}

export function loadScenarioData(scenarioId: string): ScenarioData {
  if (typeof localStorage === 'undefined') return createEmptyScenarioData(scenarioId);
  const raw = localStorage.getItem(STORAGE_PREFIX + normalizeScenarioId(scenarioId));
  if (!raw) return createEmptyScenarioData(scenarioId);
  try {
    const parsed = JSON.parse(raw) as ScenarioData;
    if (parsed.schemaVersion !== 1 || !parsed.constructionTypes || typeof parsed.constructionTypes !== 'object') {
      return createEmptyScenarioData(scenarioId);
    }
    return { ...parsed, scenarioId, monthlyClimateIndices: parsed.monthlyClimateIndices ?? {}, lockedZones: parsed.lockedZones ?? {}, agriculturalZones: parsed.agriculturalZones ?? {} };
  } catch {
    return createEmptyScenarioData(scenarioId);
  }
}

export function saveScenarioData(data: ScenarioData): void {
  if (typeof localStorage === 'undefined') throw new Error('Scenario storage is only available in a browser');
  localStorage.setItem(STORAGE_PREFIX + normalizeScenarioId(data.scenarioId), JSON.stringify(data));
}

export function exportScenarioSave(bundle: ScenarioSaveBundle): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') throw new Error('Export is only available in a browser');
  const blob = new Blob([serializeScenarioSave(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${normalizeScenarioId(bundle.scenario.scenarioId)}.smcity.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
