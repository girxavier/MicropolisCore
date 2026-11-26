import { describe, expect, it } from 'vitest';
import {
  createTerrainSnapshot,
  DEFAULT_TERRAIN_CONFIG,
  directionVector,
  parseTerrainSnapshot,
  serializeTerrainSnapshot,
  validateTerrainConfig,
  validRiverDestinations
} from './terrainEditor';

describe('SmCity terrain editor model', () => {
  it('accepts default generation settings and returns an independent copy', () => {
    const config = validateTerrainConfig(DEFAULT_TERRAIN_CONFIG);
    expect(config).toEqual(DEFAULT_TERRAIN_CONFIG);
    expect(config.densities).not.toBe(DEFAULT_TERRAIN_CONFIG.densities);
  });

  it('keeps the seed in the signed 32-bit range used by the WASM engine', () => {
    expect(() => validateTerrainConfig({ ...DEFAULT_TERRAIN_CONFIG, seed: 0x80000000 })).toThrow(RangeError);
    expect(validateTerrainConfig({ ...DEFAULT_TERRAIN_CONFIG, seed: 0x7fffffff }).seed).toBe(0x7fffffff);
  });

  it('validates every density independently in the 0–100 range', () => {
    expect(() => validateTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      densities: { ...DEFAULT_TERRAIN_CONFIG.densities, forest: 101 }
    })).toThrow(RangeError);
    expect(() => validateTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      densities: { ...DEFAULT_TERRAIN_CONFIG.densities, water: -1 }
    })).toThrow(RangeError);
  });

  it('rejects a river with identical entry and exit directions', () => {
    expect(() => validateTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      river: { ...DEFAULT_TERRAIN_CONFIG.river, from: 'NW', to: 'NW' }
    })).toThrow(/distinctes/);
  });

  it('allows opposite directions for a straight map crossing', () => {
    const config = validateTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      river: { ...DEFAULT_TERRAIN_CONFIG.river, from: 'N', to: 'S' }
    });
    expect(config.river.to).toBe('S');
    expect(directionVector('N')).toEqual([0, -1]);
    expect(directionVector('SE')).toEqual([1, 1]);
  });

  it('offers the seven possible exits from a selected entry edge', () => {
    expect(validRiverDestinations('W')).toHaveLength(7);
    expect(validRiverDestinations('W')).not.toContain('W');
  });

  it('round-trips only a dimensionally valid bare terrain snapshot', () => {
    const snapshot = createTerrainSnapshot({
      id: 'plain-01', name: 'Plaine test', createdAt: '2026-11-26T12:00:00.000Z',
      width: 3, height: 2, tiles: [0, 0, 2, 0, 37, 0],
      riverFlow: { from: 'W', to: 'E' }
    });
    expect(parseTerrainSnapshot(serializeTerrainSnapshot(snapshot))).toEqual(snapshot);
    expect(() => createTerrainSnapshot({ ...snapshot, tiles: [0, 0] })).toThrow(RangeError);
    expect(() => createTerrainSnapshot({ ...snapshot, tiles: [0, 0, -1, 0, 0, 0] })).toThrow(RangeError);
    expect(() => createTerrainSnapshot({ ...snapshot, tiles: [0, 0, 240, 0, 0, 0] })).toThrow(/terrain/);
  });

  it('rejects files that are not terrain-library documents', () => {
    expect(() => parseTerrainSnapshot(JSON.stringify({ format: 'smcity-scenario-save', version: 1 }))).toThrow();
  });
});
