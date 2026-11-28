import { describe, expect, it } from 'vitest';
import {
  createEmptyClimatePublicationState,
  detectClimateEvents,
  nextClimatePublication,
  summarizeWeather,
  visibleClimatePublication,
  type WeatherForecastReading
} from './weatherMessages';

function readings(values: Array<[number, number, number, number?, number?, number?]>): WeatherForecastReading[] {
  return values.map(([cityTime, tmin, tmax, precipitationMm = 0, weatherCode = 0, sunshineHours = 30]) => ({
    cityTime, tmin, tmax, tmoy: (tmin + tmax) / 2,
    month: Math.floor((cityTime % 48) / 4),
    unit: cityTime % 4,
    precipitationMm, weatherCode, sunshineHours
  }));
}

describe('SmCity weather summary', () => {
  it('uses clear everyday French labels for all seven weather categories', () => {
    const labels = ['Grand soleil', 'Ciel couvert', 'Éclaircies et averses', 'Pluie fine', 'Averses fréquentes', 'Orages', 'Neige'];
    expect(labels.map((_, weatherCode) => summarizeWeather({
      cityTime: 0, tmin: 0, tmax: 10, tmoy: 5, month: 0, unit: 0,
      weatherCode, precipitationMm: 4.2, sunshineHours: 18
    })?.label)).toEqual(labels);
  });

  it('keeps precipitation and sunshine non-negative', () => {
    expect(summarizeWeather({
      cityTime: 0, tmin: 5, tmax: 18, tmoy: 11.5, month: 0, unit: 0,
      weatherCode: 3, precipitationMm: -2, sunshineHours: 12.5
    })).toMatchObject({ label: 'Pluie fine', precipitationMm: 0, sunshineHours: 12.5 });
  });

  it('rejects unknown weather codes', () => {
    expect(summarizeWeather({
      cityTime: 0, tmin: 5, tmax: 18, tmoy: 11.5, month: 0, unit: 0,
      weatherCode: 9
    })).toBeNull();
  });
});

describe('Climate and municipal news events', () => {
  it('detects a continuous heatwave as one event, regardless of its duration', () => {
    const events = detectClimateEvents(readings([
      [20, 17, 31], [21, 18, 33], [22, 19, 34], [23, 18, 32]
    ]));
    expect(events.filter((event) => event.kind === 'heat')).toHaveLength(1);
    expect(events.find((event) => event.kind === 'heat')).toMatchObject({
      startCityTime: 20, endCityTime: 23, maxTmax: 34, units: 4
    });
  });

  it('publishes at most two messages for one heatwave: warning, then city-life report', () => {
    const forecast = readings([[100, 18, 27], [101, 19, 31], [102, 20, 33], [103, 19, 34]]);
    const warning = nextClimatePublication(forecast, 100, [], []);
    expect(warning.publication).toMatchObject({ kind: 'heat', phase: 'approaching' });
    const active = nextClimatePublication(forecast, 101, [], [warning.publication!.id]);
    expect(active.publication).toMatchObject({ kind: 'heat', phase: 'active' });
    const noThird = nextClimatePublication(forecast, 102, [], [warning.publication!.id, active.publication!.id]);
    expect(noThird.publication).toBeNull();
    expect(active.publication?.text).not.toMatch(/moteur|unité|seuil technique/i);
  });

  it('detects persistent rain and distinguishes a flood-level two-week rainfall total', () => {
    const forecast = readings([
      [10, 8, 15, 32, 4], [11, 9, 14, 34, 4], [12, 8, 13, 13, 4]
    ]);
    const events = detectClimateEvents(forecast);
    expect(events.some((event) => event.kind === 'rain')).toBe(true);
    expect(events.some((event) => event.kind === 'flood')).toBe(true);
  });

  it('detects four dry weeks as agricultural drought concern', () => {
    const events = detectClimateEvents(readings([
      [30, 12, 24, 0], [31, 13, 26, 0], [32, 14, 27, 0], [33, 15, 28, 0]
    ]));
    expect(events.find((event) => event.kind === 'drought')).toMatchObject({ units: 4, totalRainMm: 0 });
  });

  it('distinguishes snow from snow-related traffic disruption', () => {
    const events = detectClimateEvents(readings([[50, -2, 1, 8, 6]]));
    expect(events.some((event) => event.kind === 'snow')).toBe(true);
    expect(events.some((event) => event.kind === 'snow-traffic')).toBe(true);
    const decision = nextClimatePublication(readings([[50, -2, 1, 8, 6]]), 50, [], []);
    expect(decision.publication?.kind).toBe('snow-traffic');
  });

  it('detects warm nights and intense cold separately', () => {
    expect(detectClimateEvents(readings([[60, 20, 28], [61, 21, 29]])).some((event) => event.kind === 'warm-night')).toBe(true);
    expect(detectClimateEvents(readings([[70, -1, 4], [71, -2, 3]])).some((event) => event.kind === 'cold')).toBe(true);
  });
});

describe('Single-message display lifecycle', () => {
  it('keeps at most one current message and expires it after four simulated weeks', () => {
    const warning = nextClimatePublication(
      readings([[100, 18, 27], [101, 19, 31], [102, 20, 33]]), 100, [], [],
      '2026-01-01T00:00:00.000Z'
    ).publication!;
    const state = { ...createEmptyClimatePublicationState(), currentPublication: warning };
    expect(visibleClimatePublication(state, 103)?.id).toBe(warning.id);
    expect(visibleClimatePublication(state, 104)).toBeNull();
  });

  it('does not republish a phase already shown for the same event', () => {
    const forecast = readings([[101, 17, 31], [102, 18, 33]]);
    const first = nextClimatePublication(forecast, 101, [], []);
    expect(first.publication).not.toBeNull();
    const second = nextClimatePublication(forecast, 101, [], [first.publication!.id]);
    expect(second.publication).toBeNull();
  });

  it('uses a plain-language date in the publication detail', () => {
    const publication = nextClimatePublication(
      readings([[100, 18, 27], [101, 19, 31], [102, 20, 33]]), 100, [], []
    ).publication!;
    expect(publication.detail).toMatch(/\d{1,2} \p{L}+ 20\d{2}/u);
    expect(publication.detail).not.toMatch(/unité|cityTime/i);
  });
});
