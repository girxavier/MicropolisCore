/**
 * Messages de météo et de vie municipale produits à partir des prévisions du climat.
 * Les publications sont éphémères : une seule à l'écran, au plus quatre semaines.
 */
export interface WeatherForecastReading {
  cityTime: number;
  tmin: number;
  tmax: number;
  tmoy: number;
  month: number;
  unit: number;
  weatherCode?: number;
  precipitationMm?: number;
  sunshineHours?: number;
}

export type WeatherCategoryCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WeatherSummary {
  code: WeatherCategoryCode;
  label: string;
  precipitationMm: number;
  sunshineHours: number;
}

const WEATHER_LABELS: Record<WeatherCategoryCode, string> = {
  0: 'Grand soleil',
  1: 'Ciel couvert',
  2: 'Éclaircies et averses',
  3: 'Pluie fine',
  4: 'Averses fréquentes',
  5: 'Orages',
  6: 'Neige'
};

export function summarizeWeather(reading: WeatherForecastReading): WeatherSummary | null {
  const code = reading.weatherCode;
  if (code === undefined || code < 0 || code > 6 || !Number.isInteger(code)) return null;
  return {
    code: code as WeatherCategoryCode,
    label: WEATHER_LABELS[code as WeatherCategoryCode],
    precipitationMm: Math.max(0, reading.precipitationMm ?? 0),
    sunshineHours: Math.max(0, reading.sunshineHours ?? 0)
  };
}

export type ClimateEventKind = 'heat' | 'warm-night' | 'cold' | 'rain' | 'flood' | 'snow' | 'snow-traffic' | 'drought';
export type ClimatePublicationPhase = 'approaching' | 'active';

export interface ClimateEvent {
  key: string;
  kind: ClimateEventKind;
  startCityTime: number;
  endCityTime: number;
  minTmin: number;
  maxTmax: number;
  totalRainMm: number;
  units: number;
}

export interface ClimatePublication {
  id: string;
  kind: ClimateEventKind;
  phase: ClimatePublicationPhase;
  title: string;
  text: string;
  detail: string;
  startCityTime: number;
  endCityTime: number;
  publishedAt: string;
  publishedAtCityTime: number;
  expiresAtCityTime: number;
  important: boolean;
}

export interface ClimatePublicationState {
  currentPublication: ClimatePublication | null;
  publishedIds: string[];
  activeEvents: ClimateEvent[];
}

export interface ClimatePublicationDecision {
  publication: ClimatePublication | null;
  activeEvents: ClimateEvent[];
}

const STORAGE_PREFIX = 'smcity:climate-publications:v2:';
const MIN_SEQUENCE = 2;
const MAX_VISIBLE_WEEKS = 4;
const FLOOD_WARNING_RAIN_MM = 60;

// Les seuils sont des seuils de jeu, pas des normes hydrologiques.
// La pluie est cumulée sur deux semaines pour distinguer l'averse de l'épisode dangereux.
function qualifies(kind: ClimateEventKind, reading: WeatherForecastReading, readings: readonly WeatherForecastReading[], index: number): boolean {
  const rain = Math.max(0, reading.precipitationMm ?? 0);
  switch (kind) {
    case 'heat': return reading.tmax >= 30;
    case 'warm-night': return reading.tmin >= 20;
    case 'cold': return reading.tmin <= 0 && reading.tmax <= 5;
    case 'rain': return rain >= 8;
    case 'flood': {
      const previous = readings[index - 1];
      return !!previous && Math.max(0, previous.precipitationMm ?? 0) + rain >= FLOOD_WARNING_RAIN_MM;
    }
    case 'snow': return reading.weatherCode === 6 && rain >= 1;
    case 'snow-traffic': return reading.weatherCode === 6 && rain >= 4;
    case 'drought': return rain < 0.5;
  }
}

function eventPriority(kind: ClimateEventKind): number {
  return ({ flood: 9, 'snow-traffic': 8, heat: 7, cold: 6, drought: 5, snow: 4, rain: 3, 'warm-night': 2 } as Record<ClimateEventKind, number>)[kind];
}

export function detectClimateEvents(readings: readonly WeatherForecastReading[]): ClimateEvent[] {
  const ordered = [...readings].sort((a, b) => a.cityTime - b.cityTime);
  const events: ClimateEvent[] = [];
  const kinds: ClimateEventKind[] = ['heat', 'warm-night', 'cold', 'rain', 'flood', 'snow', 'snow-traffic', 'drought'];

  for (const kind of kinds) {
    let run: WeatherForecastReading[] = [];
    const flush = () => {
      const required = kind === 'drought' ? 4 : kind === 'snow' || kind === 'snow-traffic' || kind === 'flood' ? 1 : MIN_SEQUENCE;
      if (run.length >= required) {
        const first = run[0];
        const last = run[run.length - 1];
        events.push({
          key: `${kind}:${first.cityTime}`,
          kind,
          startCityTime: first.cityTime,
          endCityTime: last.cityTime,
          minTmin: Math.min(...run.map((item) => item.tmin)),
          maxTmax: Math.max(...run.map((item) => item.tmax)),
          totalRainMm: run.reduce((sum, item) => sum + Math.max(0, item.precipitationMm ?? 0), 0),
          units: run.length
        });
      }
      run = [];
    };

    for (let index = 0; index < ordered.length; index += 1) {
      const reading = ordered[index];
      if (qualifies(kind, reading, ordered, index)) {
        if (run.length > 0 && reading.cityTime !== run[run.length - 1].cityTime + 1) flush();
        run.push(reading);
      } else {
        flush();
      }
    }
    flush();
  }

  // Les alertes d'inondation et de circulation sous la neige priment sur les bulletins généraux.
  const trafficSnowStarts = new Set(events.filter((event) => event.kind === 'snow-traffic').map((event) => event.startCityTime));
  return events
    .filter((event) => event.kind !== 'snow' || !trafficSnowStarts.has(event.startCityTime))
    .sort((a, b) => a.startCityTime - b.startCityTime || eventPriority(b.kind) - eventPriority(a.kind));
}

function weekLabel(cityTime: number): string {
  const date = new Date(Date.UTC(2026, 0, 1) + Math.max(0, cityTime) * 7.6 * 86400000);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const MESSAGES: Record<ClimateEventKind, Record<ClimatePublicationPhase, { title: string; text: string }>> = {
  heat: {
    approaching: { title: 'Une vague de chaleur se prépare', text: 'Les prévisions annoncent plusieurs journées au-dessus de 30 °C à partir de la semaine prochaine. Les habitants sont invités à prendre leurs précautions.' },
    active: { title: 'La ville vit au rythme de la canicule', text: 'Les terrasses restent animées après le coucher du soleil et les parcs sont très fréquentés en soirée. La mairie rappelle de veiller aux personnes âgées et isolées.' }
  },
  'warm-night': {
    approaching: { title: 'Des nuits difficiles en perspective', text: 'Le thermomètre pourrait ne pas descendre sous les 20 °C plusieurs nuits de suite. Les logements auront du mal à retrouver de la fraîcheur.' },
    active: { title: 'Les nuits restent étouffantes', text: 'Au petit matin, les appartements sont encore chauds. Les services municipaux invitent les habitants à prendre des nouvelles des personnes les plus fragiles.' }
  },
  cold: {
    approaching: { title: 'Une vague de froid est annoncée', text: 'Le gel nocturne et des après-midi à peine au-dessus de 5 °C sont attendus. Les associations se préparent à renforcer les maraudes.' },
    active: { title: 'Le froid met les plus fragiles à l’épreuve', text: 'Les températures restent négatives la nuit et peinent à dépasser 5 °C le jour. Les centres d’accueil et les maraudes sont particulièrement sollicités.' }
  },
  rain: {
    approaching: { title: 'Une période très pluvieuse se dessine', text: 'Plusieurs semaines de pluie se profilent. Les sols risquent de se gorger d’eau et les promenades en bord de rivière sont à surveiller.' },
    active: { title: 'La pluie s’installe dans la durée', text: 'Les averses se succèdent depuis plusieurs semaines. Les fossés débordent par endroits et les équipes municipales surveillent les points bas.' }
  },
  flood: {
    approaching: { title: 'Risque d’inondation : vigilance dans les quartiers bas', text: 'Les pluies annoncées pourraient faire monter rapidement les eaux. La mairie prépare la mise à l’abri des habitants les plus exposés.' },
    active: { title: 'Inondations : des habitants doivent être relogés', text: 'Après les fortes pluies, plusieurs rues et logements des secteurs bas sont touchés. Les habitants évacués sont orientés vers des lieux d’hébergement.' }
  },
  snow: {
    approaching: { title: 'La neige pourrait faire son retour', text: 'Des chutes de neige sont attendues. Les services municipaux se préparent à sécuriser les trottoirs et les principaux axes.' },
    active: { title: 'La neige recouvre la ville', text: 'Les toits et les espaces verts blanchissent. Les habitants sont appelés à la prudence sur les trottoirs et les escaliers.' }
  },
  'snow-traffic': {
    approaching: { title: 'Circulation difficile en raison de la neige', text: 'Les chutes de neige pourraient compliquer les déplacements. La mairie recommande de limiter les trajets non indispensables.' },
    active: { title: 'La neige désorganise les déplacements', text: 'Ralentissements, bus perturbés et chaussées glissantes : les déplacements sont compliqués dans toute la ville. Les équipes de voirie interviennent sur les axes prioritaires.' }
  },
  drought: {
    approaching: { title: 'La sécheresse inquiète les agriculteurs', text: 'Aucune pluie significative n’est attendue depuis près d’un mois. Les maraîchers commencent à s’inquiéter pour les prochaines récoltes.' },
    active: { title: 'Les récoltes sous la menace du manque d’eau', text: 'Après plusieurs semaines sans pluie, les sols s’assèchent. Les agriculteurs redoutent une baisse des récoltes et surveillent leurs réserves d’eau.' }
  }
};

function makePublication(event: ClimateEvent, phase: ClimatePublicationPhase, currentCityTime: number, publishedAt: string): ClimatePublication {
  const message = MESSAGES[event.kind][phase];
  const date = weekLabel(event.startCityTime);
  const detail = event.kind === 'heat'
    ? `À partir du ${date} · jusqu’à ${event.maxTmax.toFixed(1)} °C prévus`
    : event.kind === 'cold'
      ? `À partir du ${date} · minimum ${event.minTmin.toFixed(1)} °C, maximum ${event.maxTmax.toFixed(1)} °C`
      : event.kind === 'flood' || event.kind === 'rain' || event.kind === 'drought'
        ? `À partir du ${date} · ${event.totalRainMm.toFixed(1)} mm de pluie sur la période observée`
        : `À partir du ${date} · ${event.units} semaines concernées`;
  return {
    id: `${event.key}:${phase}`,
    kind: event.kind,
    phase,
    title: message.title,
    text: message.text,
    detail,
    startCityTime: event.startCityTime,
    endCityTime: event.endCityTime,
    publishedAt,
    publishedAtCityTime: currentCityTime,
    expiresAtCityTime: currentCityTime + MAX_VISIBLE_WEEKS,
    important: ['heat', 'cold', 'flood', 'snow-traffic'].includes(event.kind)
  };
}

export function createEmptyClimatePublicationState(): ClimatePublicationState {
  return { currentPublication: null, publishedIds: [], activeEvents: [] };
}

export function loadClimatePublicationState(scenarioId: string): ClimatePublicationState {
  if (typeof localStorage === 'undefined') return createEmptyClimatePublicationState();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scenarioId.trim().toLowerCase());
    if (!raw) return createEmptyClimatePublicationState();
    const parsed = JSON.parse(raw) as Partial<ClimatePublicationState>;
    return {
      currentPublication: parsed.currentPublication ?? null,
      publishedIds: Array.isArray(parsed.publishedIds) ? parsed.publishedIds : [],
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

export function visibleClimatePublication(state: ClimatePublicationState, currentCityTime: number): ClimatePublication | null {
  const publication = state.currentPublication;
  return publication && currentCityTime < publication.expiresAtCityTime ? publication : null;
}

export function dismissClimatePublication(state: ClimatePublicationState): ClimatePublicationState {
  return { ...state, currentPublication: null };
}

export function nextClimatePublication(
  readings: readonly WeatherForecastReading[],
  currentCityTime: number,
  previousActiveEvents: readonly ClimateEvent[],
  publishedIds: readonly string[],
  publishedAt = new Date().toISOString()
): ClimatePublicationDecision {
  const events = detectClimateEvents(readings);
  const activeEvents = events.filter((event) => event.startCityTime <= currentCityTime && event.endCityTime >= currentCityTime);
  const upcoming = events.filter((event) => event.startCityTime > currentCityTime && event.startCityTime <= currentCityTime + 2);
  const candidates = [
    ...activeEvents.map((event) => ({ event, phase: 'active' as const })),
    ...upcoming.map((event) => ({ event, phase: 'approaching' as const }))
  ].sort((a, b) => eventPriority(b.event.kind) - eventPriority(a.event.kind) ||
    (a.phase === 'active' ? -1 : b.phase === 'active' ? 1 : 0));
  const next = candidates.find(({ event, phase }) => !publishedIds.includes(`${event.key}:${phase}`));
  return {
    publication: next ? makePublication(next.event, next.phase, currentCityTime, publishedAt) : null,
    activeEvents
  };
}
