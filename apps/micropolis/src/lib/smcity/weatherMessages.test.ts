import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyClimatePublicationState,
  detectThermalEvents,
  dismissClimatePublication,
  loadClimatePublicationState,
  nextClimatePublication,
  saveClimatePublicationState,
  summarizeWeather,
  visibleClimatePublication,
  type WeatherForecastReading
} from './weatherMessages';

function readings(values: Array<[number, number, number]>): WeatherForecastReading[] {
  return values.map(([cityTime, tmin, tmax]) => ({
    cityTime, tmin, tmax, tmoy: (tmin + tmax) / 2,
    month: Math.floor((cityTime % 48) / 4),
    unit: cityTime % 4
  }));
}

describe('SmCity weather summary', () => {
  it('maps all seven engine weather codes to the agreed French categories', () => {
    const labels = [
      'Grand soleil',
      'Couvert sans pluie',
      'Variable, soleil / nuages / averses',
      'Pluie fine / crachin',
      'Couvert et averses',
      'Orage',
      'Temps neigeux'
    ];
    expect(labels.map((_, weatherCode) => summarizeWeather({
      cityTime: 0, tmin: 0, tmax: 10, tmoy: 5, month: 0, unit: 0,
      weatherCode, precipitationMm: 4.2, sunshineHours: 18
    })?.label)).toEqual(labels);
  });

  it('keeps precipitation and sunshine non-negative and reports the 7.6-day unit values', () => {
    expect(summarizeWeather({
      cityTime: 0, tmin: 5, tmax: 18, tmoy: 11.5, month: 0, unit: 0,
      weatherCode: 3, precipitationMm: -2, sunshineHours: 12.5
    })).toMatchObject({
      label: 'Pluie fine / crachin', precipitationMm: 0, sunshineHours: 12.5
    });
  });

  it('rejects unknown weather codes instead of silently inventing a category', () => {
    expect(summarizeWeather({
      cityTime: 0, tmin: 5, tmax: 18, tmoy: 11.5, month: 0, unit: 0,
      weatherCode: 9
    })).toBeNull();
  });
});

describe('SmCity thermal event detection', () => {
  it('requires two consecutive units before declaring a heat sequence', () => {
    expect(detectThermalEvents(readings([
      [10, 18, 31], [11, 17, 28], [12, 19, 32]
    ]))).toEqual([]);
  });

  it('detects a multi-unit heat sequence and its maximum', () => {
    const events = detectThermalEvents(readings([
      [20, 17, 29], [21, 18, 31], [22, 19, 34], [23, 17, 28]
    ]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'heat', startCityTime: 21, endCityTime: 22,
      maxTmax: 34, units: 2
    });
  });

  it('detects persistent warm nights separately from daytime heat', () => {
    const events = detectThermalEvents(readings([
      [30, 20, 27], [31, 21, 28], [32, 18, 29]
    ]));
    expect(events.map((event) => event.kind)).toEqual(['warm-night']);
  });

  it('requires both freezing nights and low daytime maxima for intense cold', () => {
    const events = detectThermalEvents(readings([
      [40, -1, 4], [41, -2, 3], [42, 1, 8]
    ]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'cold', minTmin: -2, maxTmax: 4 });
  });

  it('does not join separate sequences across a missing city-time unit', () => {
    expect(detectThermalEvents(readings([
      [50, 20, 31], [52, 20, 32]
    ]))).toEqual([]);
  });
});

describe('climate publication lifecycle', () => {
  it('publishes an advance warning when a sequence starts within two units', () => {
    const decision = nextClimatePublication(
      readings([[100, 18, 26], [101, 19, 31], [102, 20, 33]]),
      100, [], [], '2026-11-27T12:00:00.000Z'
    );
    expect(decision.publication).toMatchObject({
      kind: 'heat', phase: 'approaching', important: true,
      startCityTime: 101, endCityTime: 102
    });
  });

  it('publishes an active alert when the current unit belongs to the sequence', () => {
    const decision = nextClimatePublication(
      readings([[101, 17, 31], [102, 18, 33], [103, 19, 32]]),
      101, [], [], '2026-11-27T12:00:00.000Z'
    );
    expect(decision.publication?.phase).toBe('active');
    expect(decision.activeEvents).toHaveLength(1);
  });

  it('does not republish a phase already present in the publication ledger', () => {
    const forecast = readings([[101, 17, 31], [102, 18, 33]]);
    const first = nextClimatePublication(forecast, 101, [], []);
    expect(first.publication).not.toBeNull();
    const second = nextClimatePublication(forecast, 101, [], [first.publication!.id]);
    expect(second.publication).toBeNull();
  });

  it('publishes the end of a previously active episode once it has passed', () => {
    const previous = {
      key: 'cold:70', kind: 'cold' as const, startCityTime: 70, endCityTime: 71,
      minTmin: -2, maxTmax: 4, units: 2
    };
    const decision = nextClimatePublication(
      readings([[72, 3, 10], [73, 4, 12]]), 72, [previous], []
    );
    expect(decision.publication).toMatchObject({ kind: 'cold', phase: 'ended' });
  });

  it('keeps publication history and supports dismissal without deleting history', () => {
    const state = {
      ...createEmptyClimatePublicationState(),
      history: [{
        id: 'heat:1:active', kind: 'heat' as const, phase: 'active' as const,
        title: 'Fortes chaleurs', text: 'Épisode en cours', detail: 'Tmax 34 °C',
        startCityTime: 1, endCityTime: 2, publishedAt: '2026-01-01T00:00:00.000Z',
        important: true
      }]
    };
    expect(visibleClimatePublication(state)?.id).toBe('heat:1:active');
    const dismissed = dismissClimatePublication(state, 'heat:1:active');
    expect(visibleClimatePublication(dismissed)).toBeNull();
    expect(dismissed.history).toHaveLength(1);
  });
});

describe('climate publication storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips scenario-specific publication history in browser storage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value)
    });
    const state = {
      ...createEmptyClimatePublicationState(),
      publishedIds: ['heat:1:approaching']
    };
    saveClimatePublicationState('orleans.cty', state);
    expect(loadClimatePublicationState('orleans.cty')).toEqual(state);
    expect(loadClimatePublicationState('brest.cty').publishedIds).toEqual([]);
  });
});
