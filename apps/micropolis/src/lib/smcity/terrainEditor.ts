/**
 * Terrain-only editor model.
 *
 * Kept independent from city/scenario saves: this module describes bare terrain,
 * generation parameters and reusable terrain snapshots. The WASM adapter can
 * consume the validated configuration without coupling it to city simulation.
 */

export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type RiverWidth = 'XS' | 'S' | 'M' | 'L' | 'XL';

export interface TerrainDensities {
  water: number;
  forest: number;
  wasteland: number;
  isolatedTrees: number;
}

export interface RiverGeneration {
  enabled: boolean;
  from: CompassDirection;
  to: CompassDirection;
  sinuosity: number;
  width: RiverWidth;
}

export interface TerrainGenerationConfig {
  seed: number;
  densities: TerrainDensities;
  river: RiverGeneration;
}

export interface TerrainSnapshot {
  format: 'smcity-terrain';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  /** Row-major bare terrain tile IDs only; no buildings, zones or city state. */
  tiles: number[];
  riverFlow?: { from: CompassDirection; to: CompassDirection };
}

export const TERRAIN_DIRECTIONS: readonly CompassDirection[] = [
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'
] as const;

export const RIVER_WIDTHS: readonly RiverWidth[] = ['XS', 'S', 'M', 'L', 'XL'] as const;

export const DEFAULT_TERRAIN_CONFIG: TerrainGenerationConfig = {
  seed: 1,
  densities: { water: 18, forest: 32, wasteland: 28, isolatedTrees: 8 },
  river: { enabled: true, from: 'W', to: 'E', sinuosity: 45, width: 'M' }
};

const DIRECTION_VECTOR: Record<CompassDirection, readonly [number, number]> = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1]
};

export function validateTerrainConfig(config: TerrainGenerationConfig): TerrainGenerationConfig {
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0x7fffffff) {
    throw new RangeError('La graine doit être un entier non négatif sur 32 bits.');
  }
  for (const [key, value] of Object.entries(config.densities)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`La densité « ${key} » doit être comprise entre 0 et 100.`);
    }
  }
  const { from, to, sinuosity, width } = config.river;
  if (!TERRAIN_DIRECTIONS.includes(from) || !TERRAIN_DIRECTIONS.includes(to)) {
    throw new Error('Direction de rivière inconnue.');
  }
  if (from === to) {
    throw new Error('Les directions de départ et d’arrivée doivent être distinctes.');
  }
  if (!Number.isFinite(sinuosity) || sinuosity < 0 || sinuosity > 100) {
    throw new RangeError('La sinuosité doit être comprise entre 0 et 100.');
  }
  if (!RIVER_WIDTHS.includes(width)) throw new Error('Largeur de rivière inconnue.');
  return {
    ...config,
    densities: { ...config.densities },
    river: { ...config.river }
  };
}

/** Return a normalized direction vector for the river route planner. */
export function directionVector(direction: CompassDirection): readonly [number, number] {
  return DIRECTION_VECTOR[direction];
}

/**
 * Filter destination choices: the river cannot enter and leave through the same edge.
 * Opposite directions are valid and describe a straight crossing.
 */
export function validRiverDestinations(from: CompassDirection): CompassDirection[] {
  return TERRAIN_DIRECTIONS.filter((to) => to !== from);
}

/** Keep only the engine's bare land, water and tree tile IDs when extracting a map. */
export function normalizeBareTerrainTile(tile: number): number {
  const id = tile & 0x3ff;
  return id === 0 || (id >= 2 && id <= 43) ? id : 0;
}

export function createTerrainSnapshot(input: Omit<TerrainSnapshot, 'format' | 'version'>): TerrainSnapshot {
  if (!input.id.trim() || !input.name.trim()) throw new Error('Un identifiant et un nom sont requis.');
  if (!Number.isInteger(input.width) || input.width < 1 ||
      !Number.isInteger(input.height) || input.height < 1 ||
      input.tiles.length !== input.width * input.height) {
    throw new RangeError('Dimensions de terrain invalides.');
  }
  if (input.tiles.some((tile) => !Number.isInteger(tile) ||
      !(tile === 0 || (tile >= 2 && tile <= 43)))) {
    throw new RangeError('Une carte de terrain ne peut contenir que de la terre, de l’eau et des arbres.');
  }
  if (input.riverFlow && (!TERRAIN_DIRECTIONS.includes(input.riverFlow.from) ||
      !TERRAIN_DIRECTIONS.includes(input.riverFlow.to) || input.riverFlow.from === input.riverFlow.to)) {
    throw new Error('Métadonnées de rivière invalides.');
  }
  return { ...input, format: 'smcity-terrain', version: 1, tiles: [...input.tiles] };
}

export function serializeTerrainSnapshot(snapshot: TerrainSnapshot): string {
  const validated = createTerrainSnapshot(snapshot);
  return JSON.stringify(validated);
}

export function parseTerrainSnapshot(serialized: string): TerrainSnapshot {
  const value = JSON.parse(serialized) as Partial<TerrainSnapshot>;
  if (value.format !== 'smcity-terrain' || value.version !== 1 ||
      typeof value.id !== 'string' || typeof value.name !== 'string' ||
      typeof value.createdAt !== 'string' || !Array.isArray(value.tiles) ||
      typeof value.width !== 'number' || typeof value.height !== 'number') {
    throw new Error('Fichier de terrain SmCity invalide.');
  }
  return createTerrainSnapshot(value as Omit<TerrainSnapshot, 'format' | 'version'>);
}

const TERRAIN_LIBRARY_KEY = 'smcity:terrain-library:v1';

/** Browser-local library, intentionally separate from scenario save storage. */
export function listTerrainSnapshots(): TerrainSnapshot[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(TERRAIN_LIBRARY_KEY);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown[];
    return values.map((value) => parseTerrainSnapshot(JSON.stringify(value)));
  } catch {
    return [];
  }
}

export function saveTerrainSnapshot(snapshot: TerrainSnapshot): TerrainSnapshot[] {
  if (typeof localStorage === 'undefined') throw new Error('La bibliothèque de terrains nécessite un navigateur.');
  const validated = createTerrainSnapshot(snapshot);
  const items = listTerrainSnapshots().filter((item) => item.id !== validated.id);
  items.push(validated);
  localStorage.setItem(TERRAIN_LIBRARY_KEY, JSON.stringify(items));
  return items;
}

export function deleteTerrainSnapshot(id: string): TerrainSnapshot[] {
  if (typeof localStorage === 'undefined') throw new Error('La bibliothèque de terrains nécessite un navigateur.');
  const items = listTerrainSnapshots().filter((item) => item.id !== id);
  localStorage.setItem(TERRAIN_LIBRARY_KEY, JSON.stringify(items));
  return items;
}
