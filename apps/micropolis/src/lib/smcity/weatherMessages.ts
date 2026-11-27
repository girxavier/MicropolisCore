/**
 * Climate-only editorial alerts derived from the deterministic SmCity temperature
 * sequence. One climate unit is about 7.6 days; the model advances four units/month.
 *
 * V1 deliberately reports thermal episodes only. Rain, cloud cover and sunshine
 * are not inferred from temperature alone and will be added when their own model
 * variables exist.
 */
export interface WeatherForecastReading {
  cityTime: number;
  tmin: number;
  tmax: number;
  tmoy: number;
  month: number;
  unit: number;
}

export type ThermalEventKind = 'heat' | 'warm-night' | 'cold';
export type ClimatePublicationPhase = 'approaching' | 'active' | 'ended';

export interface ThermalEvent {
  key: string;
  kind: ThermalEventKind;
  startCityTime: number;
  endCityTime: number;
  minTmin: number;
  maxTmax: number;
  units: number;
}

export interface ClimatePublication {
  id: string;
  kind: ThermalEventKind;
  phase: ClimatePublicationPhase;
  title: string;
  text: string;
  detail: string;
  startCityTime: number;
  endCityTime: number;
  publishedAt: string;
  important: boolean;
}

export interface ClimatePublicationState {
  history: ClimatePublication[];
  publishedIds: string[];
  dismissedIds: string[];
  activeEvents: ThermalEvent[];
}

export interface ClimatePublicationDecision {
  publication: ClimatePublication | null;
  activeEvents: ThermalEvent[];
}

const STORAGE_PREFIX = 'smcity:climate-publications:v1:';
const MIN_SEQUENCE_UNITS = 2;
const APPROACH_WINDOW_UNITS = 2;

// Operational V1 thresholds: two consecutive weekly-ish units are required.
// These rules are intentionally centralized so they can be tuned without
// changing the publication UI or the climate engine.
function qualifies(kind: ThermalEventKind, reading: WeatherForecastReading): boolean {
  if (kind === 'heat') return reading.tmax >= 30;
  if (kind === 'warm-night') return reading.tmin >= 20;
  return reading.tmin <= 0 && reading.tmax <= 5;
}

export function detectThermalEvents(readings: readonly WeatherForecastReading[]): ThermalEvent[] {
  const ordered = [...readings].sort((a, b) => a.cityTime - b.cityTime);
  const events: ThermalEvent[] = [];

  for (const kind of ['heat', 'warm-night', 'cold'] as const) {
    let run: WeatherForecastReading[] = [];
    const flush = () => {
      if (run.length >= MIN_SEQUENCE_UNITS) {
        const first = run[0];
        const last = run[run.length - 1];
        events.push({
          key: `${kind}:${first.cityTime}`,
          kind,
          startCityTime: first.cityTime,
          endCityTime: last.cityTime,
          minTmin: Math.min(...run.map((item) => item.tmin)),
          maxTmax: Math.max(...run.map((item) => item.tmax)),
          units: run.length
        });
      }
      run = [];
    };

    for (const reading of ordered) {
      if (qualifies(kind, reading)) {
        if (run.length > 0 && reading.cityTime !== run[run.length - 1].cityTime + 1) flush();
        run.push(reading);
      } else {
        flush();
      }
    }
    flush();
  }

  return events.sort((a, b) => a.startCityTime - b.startCityTime || priority(b.kind) - priority(a.kind));
}

function priority(kind: ThermalEventKind): number {
  return kind === 'warm-night' ? 1 : 2;
}

const MESSAGES: Record<ThermalEventKind, Record<ClimatePublicationPhase, readonly { title: string; text: string }[]>> = {
  heat: {
    approaching: [
      { title: 'Fortes chaleurs en approche', text: 'Une séquence de fortes chaleurs se profile : les maximales devraient dépasser 30 °C plusieurs unités de suite.' },
      { title: 'Épisode chaud annoncé', text: 'Le moteur anticipe plusieurs unités au-dessus de 30 °C. Un épisode de fortes chaleurs approche.' }
    ],
    active: [
      { title: 'Séquence de fortes chaleurs', text: 'Fortes chaleurs : les maximales dépassent 30 °C depuis plusieurs unités. L’épisode se poursuit.' },
      { title: 'Épisode chaud en cours', text: 'Épisode chaud en cours : le seuil de 30 °C est franchi de façon répétée.' }
    ],
    ended: [
      { title: 'Fin des fortes chaleurs', text: 'La séquence de fortes chaleurs s’achève : les maximales repassent sous le seuil de 30 °C.' }
    ]
  },
  'warm-night': {
    approaching: [
      { title: 'Nuits chaudes en approche', text: 'Des nuits très chaudes se profilent : les minimales devraient rester à 20 °C ou plus.' },
      { title: 'Nuits tropicales annoncées', text: 'Le moteur anticipe plusieurs nuits tropicales consécutives, avec des minimales supérieures ou égales à 20 °C.' }
    ],
    active: [
      { title: 'Nuits tropicales', text: 'Nuits tropicales : les minimales restent à 20 °C ou plus depuis plusieurs unités.' }
    ],
    ended: [
      { title: 'Fin des nuits tropicales', text: 'Les nuits redeviennent moins chaudes : les minimales repassent sous 20 °C.' }
    ]
  },
  cold: {
    approaching: [
      { title: 'Froid intense en approche', text: 'Un épisode de froid intense approche : gel nocturne et maximales proches ou inférieures à 5 °C sont annoncés.' }
    ],
    active: [
      { title: 'Froid intense', text: 'Froid intense en cours : les minimales sont à 0 °C ou moins et les maximales restent proches de 5 °C.' },
      { title: 'Le froid persiste', text: 'Le froid persiste : plusieurs unités consécutives combinent gel nocturne et maximales basses.' }
    ],
    ended: [
      { title: 'Recul du froid intense', text: 'La période de froid intense recule : les minimales remontent au-dessus du seuil de gel.' }
    ]
  }
};

function stableVariant(key: string, count: number): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}

function publicationFor(
  event: ThermalEvent,
  phase: ClimatePublicationPhase,
  publishedAt: string
): ClimatePublication {
  const variants = MESSAGES[event.kind][phase];
  const variant = variants[stableVariant(event.key + phase, variants.length)];
  const detail = event.kind === 'heat'
    ? `Maximum prévu : ${event.maxTmax.toFixed(1)} °C · ${event.units} unités concernées · seuil : 30 °C`
    : event.kind === 'warm-night'
      ? `Minimum nocturne le plus élevé : ${event.minTmin.toFixed(1)} °C · ${event.units} unités concernées · seuil : 20 °C`
      : `Minimum prévu : ${event.minTmin.toFixed(1)} °C · maximum : ${event.maxTmax.toFixed(1)} °C · ${event.units} unités concernées`;

  return {
    id: `${event.key}:${phase}`,
    kind: event.kind,
    phase,
    title: variant.title,
    text: variant.text,
    detail,
    startCityTime: event.startCityTime,
    endCityTime: event.endCityTime,
    publishedAt,
    important: event.kind !== 'warm-night'
  };
}

export function createEmptyClimatePublicationState(): ClimatePublicationState {
  return { history: [], publishedIds: [], dismissedIds: [], activeEvents: [] };
}

export function loadClimatePublicationState(scenarioId: string): ClimatePublicationState {
  if (typeof localStorage === 'undefined') return createEmptyClimatePublicationState();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scenarioId.trim().toLowerCase());
    if (!raw) return createEmptyClimatePublicationState();
    const parsed = JSON.parse(raw) as Partial<ClimatePublicationState>;
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      publishedIds: Array.isArray(parsed.publishedIds) ? parsed.publishedIds : [],
      dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : [],
      activeEvents: Array.isArray(parsed.activeEvents) ? parsed.activeEvents : []
    };
  } catch {
    return createEmptyClimatePublicationState();
  }
}

export function saveClimatePublicationState(scenarioId: string, state: ClimatePublicationState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_PREFIX + scenarioId.trim().toLowerCase(), JSON.stringify(state));
}

export function visibleClimatePublication(state: ClimatePublicationState): ClimatePublication | null {
  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const item = state.history[index];
    if (!state.dismissedIds.includes(item.id)) return item;
  }
  return null;
}

export function dismissClimatePublication(state: ClimatePublicationState, id: string): ClimatePublicationState {
  if (state.dismissedIds.includes(id)) return state;
  return { ...state, dismissedIds: [...state.dismissedIds, id] };
}

export function nextClimatePublication(
  readings: readonly WeatherForecastReading[],
  currentCityTime: number,
  previousActiveEvents: readonly ThermalEvent[],
  publishedIds: readonly string[],
  publishedAt = new Date().toISOString()
): ClimatePublicationDecision {
  const events = detectThermalEvents(readings);
  const activeEvents = events.filter((event) =>
    event.startCityTime <= currentCityTime && event.endCityTime >= currentCityTime
  );
  const upcoming = events.filter((event) =>
    event.startCityTime > currentCityTime &&
    event.startCityTime <= currentCityTime + APPROACH_WINDOW_UNITS
  );
  const ended = previousActiveEvents.filter((event) => event.endCityTime === currentCityTime - 1);

  const candidates: Array<{ event: ThermalEvent; phase: ClimatePublicationPhase }> = [
    ...activeEvents.map((event) => ({ event, phase: 'active' as const })),
    ...upcoming.map((event) => ({ event, phase: 'approaching' as const })),
    ...ended.map((event) => ({ event, phase: 'ended' as const }))
  ].sort((a, b) =>
    priority(b.event.kind) - priority(a.event.kind) ||
    (a.phase === 'active' ? -1 : b.phase === 'active' ? 1 : 0)
  );

  const next = candidates.find(({ event, phase }) => !publishedIds.includes(`${event.key}:${phase}`));
  return {
    publication: next ? publicationFor(next.event, next.phase, publishedAt) : null,
    activeEvents
  };
}
