import { describe, expect, it } from 'vitest';
import {
  createEmptyScenarioData,
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

  it('resets all overrides for one type without changing other types', () => {
    const initial = createEmptyScenarioData('orleans');
    const one = updateScenarioTypeProperty(initial, 'R.D1', 'climateIndex', 12);
    const two = updateScenarioTypeProperty(one, 'C.PROX', 'climateIndex', 20);
    const reset = resetScenarioTypeProperties(two, 'R.D1');
    expect(reset.constructionTypes['R.D1']).toBeUndefined();
    expect(reset.constructionTypes['C.PROX']?.climateIndex).toBe(20);
  });

  it('persists local evolution locks independently of shared construction properties', () => {
    const initial = createEmptyScenarioData('orleans');
    const locked = updateScenarioZoneLock(initial, 12, 34, true);
    expect(getScenarioZoneLock(locked, 12, 34)).toBe(true);
    const unlocked = updateScenarioZoneLock(locked, 12, 34, false);
    expect(getScenarioZoneLock(unlocked, 12, 34)).toBe(false);
    expect(Object.keys(unlocked.constructionTypes)).toHaveLength(0);
  });

  it('round-trips a scenario-bound game save bundle', () => {
    const scenario = updateScenarioTypeProperty(createEmptyScenarioData('orleans'), 'R.D1', 'climateIndex', -20);
    const serialized = serializeScenarioSave({
      format: 'smcity-scenario-save',
      version: 1,
      scenario,
      game: { cityFileName: 'orleans.cty', cityName: 'Orléans', cityYear: 2026, cityMonth: 0 }
    });
    expect(parseScenarioSave(serialized).scenario.constructionTypes['R.D1'].climateIndex).toBe(-20);
  });
});
