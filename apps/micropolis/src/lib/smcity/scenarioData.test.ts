import { describe, expect, it } from 'vitest';
import {
  createEmptyScenarioData,
  getScenarioTypeProperties,
  normalizeScenarioId,
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
