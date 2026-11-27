import { describe, expect, it } from 'vitest';
import {
  createEmptyScenarioData,
  advanceAgriculturalDevelopment,
  upsertAgriculturalZone,
  getScenarioTypeProperties,
  normalizeScenarioId,
  getAnnualClimateIndices,
  recordMonthlyClimateIndex,
  updateScenarioZoneLock,
  resetScenarioTypeProperties,
  getScenarioZoneLock,
  parseScenarioSave,
  serializeScenarioSave,
  updateScenarioTypeProperty
} from './scenarioData';

describe('SmCity scenario data', () => {
  it('normalizes scenario IDs from city file names', () => {
    expect(normalizeScenarioId('/cities/Orleans.cty')).toBe('orleans');
  });

  it('stores shared properties by construction type, not by placed occurrence', () => {
    const initial = createEmptyScenarioData('orleans');
    const changed = updateScenarioTypeProperty(initial, 'R.D2', 'climateIndex', 42);
    expect(getScenarioTypeProperties(changed, 'R.D2')).toEqual({ climateIndex: 42 });
    expect(changed.constructionTypes['R.D2']).toBeDefined();
    expect(Object.keys(changed.constructionTypes)).toEqual(['R.D2']);
  });

  it('rejects climate values outside the signed index range', () => {
    expect(() => updateScenarioTypeProperty(createEmptyScenarioData('x'), 'R.D1', 'climateIndex', 101)).toThrow(RangeError);
  });

  it('records monthly indices and only returns complete annual records', () => {
    let data = createEmptyScenarioData('orleans');
    data = recordMonthlyClimateIndex(data, 2026, 0, -10);
    expect(getAnnualClimateIndices(data, 2026)).toBeNull();
    for (let month = 1; month < 12; month += 1) data = recordMonthlyClimateIndex(data, 2026, month, month);
    expect(getAnnualClimateIndices(data, 2026)).toEqual([-10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('stores agricultural parcels and advances one development level every twelve simulated months', () => {
    let data = createEmptyScenarioData('orleans');
    data = upsertAgriculturalZone(data, {
      id: '20,30', x: 20, y: 30, level: 0, monthsInStage: 0,
      specialization: 'MAR', productionMode: 'BIO'
    });
    for (let month = 0; month < 11; month++) data = advanceAgriculturalDevelopment(data);
    expect(data.agriculturalZones['20,30'].level).toBe(0);
    data = advanceAgriculturalDevelopment(data);
    expect(data.agriculturalZones['20,30'].level).toBe(1);
    expect(data.agriculturalZones['20,30'].monthsInStage).toBe(0);
    for (let month = 0; month < 48; month++) data = advanceAgriculturalDevelopment(data);
    expect(data.agriculturalZones['20,30'].level).toBe(5);
  });

  it('records city climate indices above 100 without clamping', () => {
    let data = createEmptyScenarioData('orleans');
    for (let month = 0; month < 12; month++) data = recordMonthlyClimateIndex(data, 2026, month, 125);
    expect(getAnnualClimateIndices(data, 2026)).toEqual(Array(12).fill(125));
  });

  it('resets all overrides for one type without changing other types', () => {
    const initial = createEmptyScenarioData('orleans');
    const one = updateScenarioTypeProperty(initial, 'R.D1', 'climateIndex', 12);
    const two = updateScenarioTypeProperty(one, 'C.PROX', 'climateIndex', 20);
    const reset = resetScenarioTypeProperties(two, 'R.D1');
    expect(reset.constructionTypes['R.D1']).toBeUndefined();
    expect(reset.constructionTypes['C.PROX']?.climateIndex).toBe(20);
  });

  it('keeps evolution locks independent for neighbouring buildings', () => {
    const initial = createEmptyScenarioData('orleans');
    const first = updateScenarioZoneLock(initial, 12, 34, true);
    const both = updateScenarioZoneLock(first, 16, 34, true);
    expect(getScenarioZoneLock(both, 12, 34)).toBe(true);
    expect(getScenarioZoneLock(both, 16, 34)).toBe(true);

    const onlySecond = updateScenarioZoneLock(both, 12, 34, false);
    expect(getScenarioZoneLock(onlySecond, 12, 34)).toBe(false);
    expect(getScenarioZoneLock(onlySecond, 16, 34)).toBe(true);
    expect(Object.keys(onlySecond.constructionTypes)).toHaveLength(0);
  });

  it('round-trips a scenario-bound game save bundle', () => {
    let scenario = updateScenarioTypeProperty(createEmptyScenarioData('orleans'), 'R.D1', 'climateIndex', -20);
    scenario = updateScenarioZoneLock(scenario, 12, 34, true);
    scenario = updateScenarioZoneLock(scenario, 16, 34, true);
    const serialized = serializeScenarioSave({
      format: 'smcity-scenario-save',
      version: 1,
      scenario,
      game: { cityFileName: 'orleans.cty', cityName: 'Orléans', cityYear: 2026, cityMonth: 0 }
    });
    const restored = parseScenarioSave(serialized).scenario;
    expect(restored.constructionTypes['R.D1'].climateIndex).toBe(-20);
    expect(getScenarioZoneLock(restored, 12, 34)).toBe(true);
    expect(getScenarioZoneLock(restored, 16, 34)).toBe(true);
  });
});
