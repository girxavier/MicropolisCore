/**
 * Reactive façade over the Micropolis WASM engine: Embind callbacks update `$state`
 * here; UI and tooling import this module instead of touching `Micropolis` / heap views.
 *
 * Callbacks carry most context handlers need; use **peek** / **poke** / **memory** when you
 * must read authoritative WASM state, edit tiles, or scan linear map buffers.
 *
 * Attach once per shared simulator (`attach` / `detach` around the MicropolisView lifecycle).
 */

import type { EditingTool, GameLevel, Micropolis, JSCallback, ToolResult } from '../types/micropolisengine.d.js';
import type { MicropolisSimulator } from './MicropolisSimulator';
import { heapU16FromEmscriptenModule } from './wasm/heap';
import { commandBus } from './CommandBus';
import { computeAnnualCityClimateIndex, computeMapCellTemperatures, computeMapCityClimateIndex } from './smcity/urbanClimate';
import { advanceAgriculturalDevelopment, getAnnualClimateIndices, getScenarioTypeProperties, getScenarioZoneLock, loadScenarioData, recordMonthlyClimateIndex, saveScenarioData, updateScenarioTypeProperty, updateScenarioZoneLock } from './smcity/scenarioData';
import { resolveConstructionTypeFromTileId } from './smcity/constructionCatalog';
import {
	dismissClimatePublication as dismissStoredClimatePublication,
	loadClimatePublicationState,
	nextClimatePublication,
	saveClimatePublicationState,
	visibleClimatePublication,
	summarizeWeather,
	type ClimatePublication,
	type ClimatePublicationState,
	type WeatherSummary
} from './smcity/weatherMessages';

// --- Attached simulator (not exported; drives sync + optional actions) ---
let attachedSimulator = $state<MicropolisSimulator | null>(null);

function requireMicropolis(): Micropolis {
	const m = attachedSimulator?.micropolis;
	if (!m) {
		throw new Error('micropolisReactive: attach MicropolisSimulator before engine access');
	}
	return m;
}

// --- Reactive city / sim snapshot (callback-fed + syncFromEngine) ---
let totalFunds = $state(0);
let cityYear = $state(0);
let cityMonth = $state(0);
let cityName = $state('');
let cityFileName = $state('');
let demandR = $state(0);
let demandC = $state(0);
let demandI = $state(0);
let gameLevel = $state(0);
let simSpeed = $state(0);
let gameSpeedIndex = $state(1);
let simPasses = $state(1);
let simPaused = $state(false);
let cityTax = $state(0);
let mapRevision = $state(0);
let mapCameraRevision = $state(0);
let budgetRevision = $state(0);
let evaluationRevision = $state(0);
let historyRevision = $state(0);

/** Last engine advisory (sendMessage). */
let messageIndex = $state(-1);
let messageX = $state(0);
let messageY = $state(0);
let messagePicture = $state(false);
let messageImportant = $state(false);

let budgetModalRequested = $state(false);

export type MicropolisZoneStatus =
	| { visible: false }
	| {
			visible: true;
			tileCategory: number;
			populationDensity: number;
			landValue: number;
			crimeRate: number;
			pollution: number;
			growthRate: number;
			x: number;
			y: number;
			tileId: number;
			constructionTypeId: string | null;
	  };

let zoneStatus = $state<MicropolisZoneStatus>({ visible: false });

/** Optional headline stats refreshed from the engine object (pull). */
let cityPop = $state(0);
let cityScore = $state(0);
let cityTime = $state(0);
let temperatureMin = $state(0);
let temperatureMax = $state(0);
let temperatureMean = $state(0);
let climateReady = $state(false);
let cityClimateIndex = $state<number | null>(null);
let climatePublication = $state<ClimatePublication | null>(null);
let climatePublicationHistory = $state<ClimatePublication[]>([]); // Kept empty for compatibility; the UI no longer stores or displays a history.
let climateWeather = $state<WeatherSummary | null>(null);
let climatePublicationRevision = $state(0);
let localClimateTemperatures: Float32Array | null = null;
let zoneLockRevision = $state(0);

function syncFromEngine(): void {
	const m = attachedSimulator?.micropolis;
	if (!m) return;
	totalFunds = m.totalFunds;
	cityYear = m.cityYear;
	cityMonth = m.cityMonth;
	cityName = m.cityName;
	cityFileName = m.cityFileName;
	gameLevel = (m.gameLevel as unknown as { value: number })?.value ?? Number(m.gameLevel as unknown);
	simSpeed = m.simSpeed;
	gameSpeedIndex = attachedSimulator?.gameSpeed ?? gameSpeedIndex;
	simPasses = m.simPasses;
	simPaused = m.simPaused;
	cityTax = m.cityTax;
	cityPop = m.cityPop;
	cityScore = m.cityScore;
	cityTime = m.cityTime;
	temperatureMin = m.temperatureMin;
	temperatureMax = m.temperatureMax;
	temperatureMean = m.temperatureMean;
	climateReady = m.climateReady;
}

/**
 * MOP selects the atlas independently of map tile IDs. Whenever the engine
 * replaces the map, rebind the view and return every cell to the base tileset.
 */
function resetMopAtlasSelectors(): void {
	attachedSimulator?.syncMapViews();
	attachedSimulator?.mopData?.fill(0);
}

/** Recompute and persist the current month's map-derived urban climate index. */
function isLockableZoneType(typeId: string | null): boolean {
	return !!typeId && (typeId.startsWith('R.') || typeId.startsWith('C.') || typeId.startsWith('I.')); // Agriculture is resolved from scenario parcels below.
}

function findZoneLockCenter(x: number, y: number): { x: number; y: number } {
	const map = attachedSimulator?.mapData;
	const engine = attachedSimulator?.micropolisengine;
	if (!map || !engine) return { x, y };
	const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
	// Agricultural parcels are stored in scenario metadata rather than legacy
	// Micropolis map tiles, so resolve their 3×3 footprint before checking R/C/I.
	const agriculturalZone = Object.values(loadScenarioData(scenarioId).agriculturalZones ?? {})
		.find((zone) => Math.abs(zone.x - x) <= 1 && Math.abs(zone.y - y) <= 1);
	if (agriculturalZone) return { x: agriculturalZone.x, y: agriculturalZone.y };
	const zoneBit = engine.MapTileBits.ZONEBIT.value;
	// R/C/I zones occupy exactly 3×3 tiles. Their unique center is therefore
	// at most one tile away on either axis; a wider search could accidentally
	// attach a click on a road or empty lot to a neighbouring building.
	for (let radius = 0; radius <= 1; radius += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
			const cx = x + dx, cy = y + dy;
			if (cx < 0 || cy < 0 || cx >= engine.WORLD_W || cy >= engine.WORLD_H) continue;
			const tile = map[cx * engine.WORLD_H + cy];
			if (tile !== undefined && (tile & zoneBit) !== 0 && isLockableZoneType(resolveConstructionTypeFromTileId(tile))) {
				return { x: cx, y: cy };
			}
		}
	}
	return { x, y };
}

function isLockableZoneCenter(x: number, y: number): boolean {
	const map = attachedSimulator?.mapData;
	const engine = attachedSimulator?.micropolisengine;
	if (!map || !engine || x < 0 || y < 0 || x >= engine.WORLD_W || y >= engine.WORLD_H) return false;
	const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
	const agriculturalCenter = Object.values(loadScenarioData(scenarioId).agriculturalZones ?? {})
		.some((zone) => zone.x === x && zone.y === y);
	if (agriculturalCenter) return true;
	const tile = map[x * engine.WORLD_H + y] ?? 0;
	return (tile & engine.MapTileBits.ZONEBIT.value) !== 0 && isLockableZoneType(resolveConstructionTypeFromTileId(tile));
}

function applyScenarioZoneLocks(data: ReturnType<typeof loadScenarioData>): void {
	const engine = attachedSimulator?.micropolis;
	const module = attachedSimulator?.micropolisengine;
	const map = attachedSimulator?.mapData;
	if (!engine || !module || !map || typeof engine.clearZoneLocks !== 'function' || typeof engine.setZoneLocked !== 'function') return;
	engine.clearZoneLocks();
	const validLocks: Record<string, boolean> = {};
	const zoneBit = module.MapTileBits.ZONEBIT.value;
	for (const [key, locked] of Object.entries(data.lockedZones ?? {})) {
		if (!locked) continue;
		const [x, y] = key.split(',').map(Number);
		if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= module.WORLD_W || y >= module.WORLD_H) continue;
		const tile = map[x * module.WORLD_H + y];
		const agriculturalCenter = Object.values(data.agriculturalZones ?? {}).some((zone) => zone.x === x && zone.y === y);
		const legacyGrowthZone = (tile & zoneBit) !== 0 && isLockableZoneType(resolveConstructionTypeFromTileId(tile));
		if (!agriculturalCenter && !legacyGrowthZone) continue;
		validLocks[key] = true;
		engine.setZoneLocked(x, y, true);
	}
	if (Object.keys(validLocks).length !== Object.keys(data.lockedZones ?? {}).length && typeof localStorage !== 'undefined') {
		// Tests and server-side rendering have no browser storage; keep the in-memory
		// engine state valid without trying to persist a browser-only cleanup.
		saveScenarioData({ ...data, lockedZones: validLocks, updatedAt: new Date().toISOString() });
	}
	zoneLockRevision++;
}

function refreshLocalClimateTemperatureField(): void {
	const simulator = attachedSimulator;
	if (!simulator?.mapData || simulator.mapData.length !== 12000) return;
	const scenario = loadScenarioData(cityFileName || simulator.cityFileName || simulator.micropolis?.cityName || 'default');
	localClimateTemperatures = computeMapCellTemperatures(simulator.mapData, temperatureMean, scenario, 1);
}

function refreshClimatePublications(): void {
	const simulator = attachedSimulator;
	const engine = simulator?.micropolis;
	if (!engine || !climateReady || typeof engine.getClimateForecast !== 'function') return;
	const scenarioId = cityFileName || simulator?.cityFileName || engine.cityName || 'default';
	try {
		// The forecast is already generated by the climate model. It is read-only:
		// looking ahead never changes the weather currently applied to the city.
		const forecast = engine.getClimateForecast(8);
		if (forecast.length === 0) return;
		climateWeather = summarizeWeather(forecast[0]);
		const currentCityTime = forecast[0].cityTime;
		const state = loadClimatePublicationState(scenarioId);
		const stillVisible = state.currentPublication &&
			currentCityTime < state.currentPublication.expiresAtCityTime
			? state.currentPublication
			: null;
		const decision = nextClimatePublication(
			forecast,
			currentCityTime,
			state.activeEvents,
			state.publishedIds
		);
		const publication = stillVisible ?? decision.publication;
		const nextState: ClimatePublicationState = {
			currentPublication: publication,
			publishedIds: decision.publication
				? [...state.publishedIds, decision.publication.id]
				: state.publishedIds,
			activeEvents: decision.activeEvents
		};
		saveClimatePublicationState(scenarioId, nextState);
		climatePublication = visibleClimatePublication(nextState, currentCityTime);
		climatePublicationHistory = [];
		climatePublicationRevision++;
	} catch (error) {
		console.warn('SmCity weather publications could not be refreshed:', error);
	}
}

function refreshCityClimateIndex(): void {
	const simulator = attachedSimulator;
	const scenarioId = cityFileName || simulator?.cityFileName || simulator?.micropolis?.cityName || '';
	if (!scenarioId || !simulator?.mapData || simulator.mapData.length !== 12000) return;
	try {
		const scenario = loadScenarioData(scenarioId);
		const index = computeMapCityClimateIndex(simulator.mapData, scenario);
		cityClimateIndex = index;
		const data = recordMonthlyClimateIndex(scenario, cityYear, cityMonth, index);
		// Cartographic field only: never fed back into the annual climate engine.
		localClimateTemperatures = computeMapCellTemperatures(simulator.mapData, temperatureMean, data, 1);
		// Climate calculations also run in Node-based tests and during SSR.
		// Persist only when browser storage exists; the calculation itself remains active.
		if (typeof localStorage !== 'undefined') saveScenarioData(data);
		applyScenarioZoneLocks(data);
		const engine = simulator.micropolis;
		if (engine && typeof engine.setAnnualCityClimateIndex === 'function') {
			const yearIndex = Math.max(0, Math.floor((engine.cityTime - engine.climateEpochCityTime) / 48));
			const previousYear = getAnnualClimateIndices(data, cityYear - 1);
			if (previousYear) engine.setAnnualCityClimateIndex(yearIndex, computeAnnualCityClimateIndex(previousYear));
			if (cityMonth === 11) {
				const completedYear = getAnnualClimateIndices(data, cityYear);
				if (completedYear) engine.setAnnualCityClimateIndex(yearIndex + 1, computeAnnualCityClimateIndex(completedYear));
			}
		}
	} catch (error) {
		console.warn('SmCity climate index could not be refreshed:', error);
	}
}

/**
 * Embind callback object — pass to `new micropolisengine.JSCallback(...)`.
 * Singleton so the simulator always feeds the same reactive store.
 * (Embind adds ClassHandle methods on the wrapped object; plain TS class matches call surface.)
 */
let mapPanHandler = $state<((x: number, y: number) => void) | null>(null);

class MicropolisReactiveCallback {
	autoGoto(_micropolis: Micropolis | null, _callbackVal: unknown, x: number, y: number, _message: string): void {
		mapPanHandler?.(x, y);
	}

	didGenerateMap(_micropolis: Micropolis | null, _callbackVal: unknown, _seed: number): void {
		syncFromEngine();
		resetMopAtlasSelectors();
		refreshCityClimateIndex();
		mapRevision++;
	}

	didLoadCity(_micropolis: Micropolis | null, _callbackVal: unknown, _filename: string): void {
		syncFromEngine();
		resetMopAtlasSelectors();
		refreshCityClimateIndex();
		mapRevision++;
	}

	didLoadScenario(_micropolis: Micropolis | null, _callbackVal: unknown, _name: string, _fname: string): void {
		syncFromEngine();
		resetMopAtlasSelectors();
		mapRevision++;
	}

	didLoseGame(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		syncFromEngine();
	}

	didSaveCity(_micropolis: Micropolis | null, _callbackVal: unknown, _filename: string): void {
		syncFromEngine();
	}

	didTool(_micropolis: Micropolis | null, _callbackVal: unknown, _name: string, _x: number, _y: number): void {
		mapRevision++;
	}

	didWinGame(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		syncFromEngine();
	}

	didntLoadCity(_micropolis: Micropolis | null, _callbackVal: unknown, _filename: string): void {
		/* keep prior snapshot */
	}

	didntSaveCity(_micropolis: Micropolis | null, _callbackVal: unknown, _filename: string): void {
		/* keep prior snapshot */
	}

	makeSound(
		_micropolis: Micropolis | null,
		_callbackVal: unknown,
		_channel: string,
		_sound: string,
		_x: number,
		_y: number
	): void {
		/* Audio layer can subscribe later */
	}

	newGame(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		syncFromEngine();
		mapRevision++;
	}

	saveCityAs(_micropolis: Micropolis | null, _callbackVal: unknown, _filename: string): void {
		syncFromEngine();
	}

	sendMessage(
		_micropolis: Micropolis | null,
		_callbackVal: unknown,
		index: number,
		x: number,
		y: number,
		picture: boolean,
		important: boolean
	): void {
		messageIndex = index;
		messageX = x;
		messageY = y;
		messagePicture = picture;
		messageImportant = important;
	}

	showBudgetAndWait(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		budgetModalRequested = true;
		budgetRevision++;
	}

	showZoneStatus(
		_micropolis: Micropolis | null,
		_callbackVal: unknown,
		tileCategoryIndex: number,
		populationDensityIndex: number,
		landValueIndex: number,
		crimeRateIndex: number,
		pollutionIndex: number,
		growthRateIndex: number,
		x: number,
		y: number
	): void {
		// Embind callback arguments are not guaranteed to expose the full Micropolis
		// instance as a callable JS object. Read the authoritative engine attached to
		// this reactive bridge instead; otherwise Query throws before the panel opens.
		const engine = attachedSimulator?.micropolis;
		const tileId = engine?.getTile(x, y) ?? 0;
		zoneStatus = {
			visible: true,
			tileCategory: tileCategoryIndex,
			populationDensity: populationDensityIndex,
			landValue: landValueIndex,
			crimeRate: crimeRateIndex,
			pollution: pollutionIndex,
			growthRate: growthRateIndex,
			x,
			y,
			tileId,
			constructionTypeId: (() => {
				const scenarioId = cityFileName || engine?.cityName || 'default';
				const agriculturalZone = Object.values(loadScenarioData(scenarioId).agriculturalZones ?? {})
					.find((zone) => Math.abs(zone.x - x) <= 1 && Math.abs(zone.y - y) <= 1);
				return agriculturalZone
					? `A.${agriculturalZone.specialization}.D${Math.max(1, agriculturalZone.level)}.${agriculturalZone.productionMode}`
					: resolveConstructionTypeFromTileId(tileId);
			})()
		};
	}

	simulateRobots(_micropolis: Micropolis | null, _callbackVal: unknown): void {}

	simulateChurch(
		_micropolis: Micropolis | null,
		_callbackVal: unknown,
		_posX: number,
		_posY: number,
		_churchNumber: number
	): void {}

	startEarthquake(_micropolis: Micropolis | null, _callbackVal: unknown, _strength: number): void {
		mapRevision++;
	}

	startGame(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		syncFromEngine();
	}

	startScenario(_micropolis: Micropolis | null, _callbackVal: unknown, _scenario: number): void {
		syncFromEngine();
	}

	updateBudget(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		budgetRevision++;
	}

	updateCityName(_micropolis: Micropolis | null, _callbackVal: unknown, name: string): void {
		cityName = name;
	}

	updateDate(_micropolis: Micropolis | null, _callbackVal: unknown, year: number, month: number): void {
		cityYear = year;
		cityMonth = month;
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const scenario = loadScenarioData(scenarioId);
		const advanced = advanceAgriculturalDevelopment(scenario);
		if (advanced !== scenario) {
			saveScenarioData(advanced);
			mapRevision++;
		}
		refreshCityClimateIndex();
	}

	updateClimate(
		_micropolis: Micropolis | null,
		_callbackVal: unknown,
		tmin: number,
		tmax: number,
		tmoy: number,
		_month: number,
		_unit: number
	): void {
		temperatureMin = tmin;
		temperatureMax = tmax;
		temperatureMean = tmoy;
		climateReady = true;
		refreshLocalClimateTemperatureField();
		refreshClimatePublications();
	}

	updateDemand(_micropolis: Micropolis | null, _callbackVal: unknown, r: number, c: number, i: number): void {
		demandR = r;
		demandC = c;
		demandI = i;
	}

	updateEvaluation(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		evaluationRevision++;
	}

	updateFunds(_micropolis: Micropolis | null, _callbackVal: unknown, funds: number): void {
		totalFunds = funds;
	}

	updateGameLevel(_micropolis: Micropolis | null, _callbackVal: unknown, level: number): void {
		gameLevel = level;
	}

	updateHistory(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		historyRevision++;
	}

	updateMap(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		mapRevision++;
	}

	updateOptions(_micropolis: Micropolis | null, _callbackVal: unknown): void {
		syncFromEngine();
	}

	updatePasses(_micropolis: Micropolis | null, _callbackVal: unknown, passes: number): void {
		simPasses = passes;
		gameSpeedIndex = attachedSimulator?.gameSpeed ?? gameSpeedIndex;
	}

	updatePaused(_micropolis: Micropolis | null, _callbackVal: unknown, paused: boolean): void {
		simPaused = paused;
	}

	updateSpeed(_micropolis: Micropolis | null, _callbackVal: unknown, speed: number): void {
		simSpeed = speed;
	}

	updateTaxRate(_micropolis: Micropolis | null, _callbackVal: unknown, tax: number): void {
		cityTax = tax;
	}

	delete(): void {}
}

const engineCallbackSingleton = new MicropolisReactiveCallback() as unknown as JSCallback;

/** Fresh scalar read from the live `Micropolis` object (authoritative vs reactive mirror). */
export interface MicropolisEnginePeekScalars {
	totalFunds: number;
	cityYear: number;
	cityMonth: number;
	cityTime: number;
	cityPop: number;
	cityScore: number;
	cityYes: number;
	cityClass: number;
	gameLevel: number;
	simSpeed: number;
	simPasses: number;
	simPaused: boolean;
	cityTax: number;
	mapSerial: number;
	trafficAverage: number;
	pollutionAverage: number;
	crimeAverage: number;
	landValueAverage: number;
	generatedCitySeed: number;
	resPop: number;
	comPop: number;
	indPop: number;
	cashFlow: number;
	poweredZoneCount: number;
	unpoweredZoneCount: number;
}

export interface MicropolisReactiveSnapshot {
	totalFunds: number;
	cityYear: number;
	cityMonth: number;
	cityName: string;
	cityFileName: string;
	demandR: number;
	demandC: number;
	demandI: number;
	gameLevel: number;
	simSpeed: number;
	simPasses: number;
	simPaused: boolean;
	cityTax: number;
	mapRevision: number;
	budgetRevision: number;
	evaluationRevision: number;
	historyRevision: number;
	messageIndex: number;
	messageX: number;
	messageY: number;
	messagePicture: boolean;
	messageImportant: boolean;
	budgetModalRequested: boolean;
	zoneStatus: MicropolisZoneStatus;
	cityPop: number;
	cityScore: number;
	cityTime: number;
	temperatureMin: number;
	temperatureMax: number;
	temperatureMean: number;
	climateReady: boolean;
	worldWidth: number;
	worldHeight: number;
}

function peekEngineScalars(): MicropolisEnginePeekScalars | null {
	const m = attachedSimulator?.micropolis;
	if (!m) return null;
	return {
		totalFunds: m.totalFunds,
		cityYear: m.cityYear,
		cityMonth: m.cityMonth,
		cityTime: m.cityTime,
		cityPop: m.cityPop,
		cityScore: m.cityScore,
		cityYes: m.cityYes,
		cityClass: (m.cityClass as unknown as { value: number })?.value ?? Number(m.cityClass as unknown),
		gameLevel: (m.gameLevel as unknown as { value: number })?.value ?? Number(m.gameLevel as unknown),
		simSpeed: m.simSpeed,
		simPasses: m.simPasses,
		simPaused: m.simPaused,
		cityTax: m.cityTax,
		mapSerial: m.mapSerial,
		trafficAverage: m.trafficAverage,
		pollutionAverage: m.pollutionAverage,
		crimeAverage: m.crimeAverage,
		landValueAverage: m.landValueAverage,
		generatedCitySeed: m.generatedCitySeed,
		resPop: m.resPop,
		comPop: m.comPop,
		indPop: m.indPop,
		cashFlow: m.cashFlow,
		poweredZoneCount: m.poweredZoneCount,
		unpoweredZoneCount: m.unpoweredZoneCount
	};
}

function memoryBounds(): { w: number; h: number } | null {
	const eng = attachedSimulator?.micropolisengine;
	if (!eng) return null;
	return { w: eng.WORLD_W as number, h: eng.WORLD_H as number };
}

function tileLinearIndex(x: number, y: number): number | null {
	const b = memoryBounds();
	if (!b) return null;
	if (x < 0 || y < 0 || x >= b.w || y >= b.h) return null;
	return y * b.w + x;
}

export const micropolisReactive = {
	get engineCallback(): JSCallback {
		return engineCallbackSingleton as JSCallback;
	},

	attach(sim: MicropolisSimulator): void {
		attachedSimulator = sim;
		syncFromEngine();
		refreshCityClimateIndex();
	},

	detach(): void {
		attachedSimulator = null;
	},

	syncFromEngine,
	refreshCityClimateIndex,
	isZoneLockableAt(x: number, y: number): boolean {
		const center = findZoneLockCenter(x, y);
		return typeof attachedSimulator?.micropolis?.setZoneLocked === 'function' && isLockableZoneCenter(center.x, center.y);
	},
	isZoneLockedAt(x: number, y: number): boolean {
		void zoneLockRevision;
		const center = findZoneLockCenter(x, y);
		return getScenarioZoneLock(loadScenarioData(cityFileName || attachedSimulator?.micropolis?.cityName || 'default'), center.x, center.y);
	},
	getScenarioConstructionProperties(typeId: string): Record<string, string | number | boolean | null> {
		void zoneLockRevision;
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		return getScenarioTypeProperties(loadScenarioData(scenarioId), typeId);
	},
	setScenarioConstructionProperty(typeId: string, property: string, value: number | string | boolean | null): void {
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const next = updateScenarioTypeProperty(loadScenarioData(scenarioId), typeId, property, value);
		saveScenarioData(next);
		refreshCityClimateIndex();
		zoneLockRevision++;
	},
	setZoneLockedAt(x: number, y: number, locked: boolean): void {
		const center = findZoneLockCenter(x, y);
		if (!isLockableZoneCenter(center.x, center.y)) return;
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const next = updateScenarioZoneLock(loadScenarioData(scenarioId), center.x, center.y, locked);
		saveScenarioData(next);
		if (typeof attachedSimulator?.micropolis?.setZoneLocked === 'function') attachedSimulator.micropolis.setZoneLocked(center.x, center.y, locked);
		zoneLockRevision++;
	},
	clearScenarioZoneLocks(): void {
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const data = loadScenarioData(scenarioId);
		saveScenarioData({ ...data, lockedZones: {}, updatedAt: new Date().toISOString() });
		if (typeof attachedSimulator?.micropolis?.clearZoneLocks === 'function') attachedSimulator.micropolis.clearZoneLocks();
		zoneLockRevision++;
	},
	clearScenarioAgriculturalZones(): void {
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const data = loadScenarioData(scenarioId);
		if (Object.keys(data.agriculturalZones ?? {}).length === 0) return;
		saveScenarioData({ ...data, agriculturalZones: {}, updatedAt: new Date().toISOString() });
		mapRevision++;
	},

	/**
	 * Embind module (`WORLD_W`, `MapTileBits`, `EditingTool`, `Tiles`, …).
	 * Prefer callback context for UI; use this for tools and typed constants.
	 */
	get cityFileNames(): string[] {
		return attachedSimulator?.cityFileNames ?? [];
	},
	get climatePublication(): ClimatePublication | null {
		void climatePublicationRevision;
		return climatePublication;
	},
	get climatePublicationHistory(): ClimatePublication[] {
		void climatePublicationRevision;
		return climatePublicationHistory;
	},
	get climateWeather(): WeatherSummary | null {
		void climatePublicationRevision;
		return climateWeather;
	},
	dismissClimatePublication(id: string): void {
		const scenarioId = cityFileName || attachedSimulator?.cityFileName || attachedSimulator?.micropolis?.cityName || 'default';
		const state = loadClimatePublicationState(scenarioId);
		if (state.currentPublication?.id !== id) return;
		const next = dismissStoredClimatePublication(state);
		saveClimatePublicationState(scenarioId, next);
		climatePublication = null;
		climatePublicationHistory = [];
		climatePublicationRevision++;
	},

	loadCity(fileName: string): boolean {
		commandBus.clearHistory();
		return attachedSimulator?.loadCity(fileName) ?? false;
	},

	loadScenario(scenario: number): void {
		commandBus.clearHistory();
		if (typeof attachedSimulator?.micropolis?.clearZoneLocks === 'function') attachedSimulator.micropolis.clearZoneLocks();
		attachedSimulator?.loadScenario(scenario);
		zoneLockRevision++;
		syncFromEngine();
		refreshCityClimateIndex();
		mapRevision++;
	},

	get localClimateTemperatures(): Float32Array | null {
		return localClimateTemperatures;
	},

	get wasmModule(): MicropolisSimulator['micropolisengine'] | null {
		return attachedSimulator?.micropolisengine ?? null;
	},

	/**
	 * Direct WASM heap / layer views. Map and mop are the primary UI layers; `heapU16` is the
	 * full linear memory view — only touch word ranges you understand.
	 */
	memory: {
		get mapU16(): Uint16Array | null {
			return attachedSimulator?.mapData ?? null;
		},
		get mopU16(): Uint16Array | null {
			return attachedSimulator?.mopData ?? null;
		},
		get heapU16(): Uint16Array | null {
			const eng = attachedSimulator?.micropolisengine;
			return eng ? heapU16FromEmscriptenModule(eng) : null;
		},
		get mapWordLength(): number {
			const m = attachedSimulator?.micropolis;
			return m ? m.getMapSize() / 2 : 0;
		},
		get mopWordLength(): number {
			const m = attachedSimulator?.micropolis;
			return m ? m.getMopSize() / 2 : 0;
		},
		bounds: memoryBounds,
		tileLinearIndex,
		/** Byte addresses into linear WASM memory (for native tooling). */
		mapByteAddress(): number {
			return attachedSimulator?.micropolis?.getMapAddress() ?? 0;
		},
		mopByteAddress(): number {
			return attachedSimulator?.micropolis?.getMopAddress() ?? 0;
		}
	},

	/** Read-only accessors — synchronous pulls from the engine when callbacks are not enough. */
	peek: {
		scalars: peekEngineScalars,
		tile(x: number, y: number): number | null {
			const m = attachedSimulator?.micropolis;
			if (!m || tileLinearIndex(x, y) === null) return null;
			return m.getTile(x, y);
		}
	},

	/** Mutations through supported Embind APIs; bumps `mapRevision` when the map may change. */
	poke: {
		setTile(x: number, y: number, value: number): void {
			const m = requireMicropolis();
			if (tileLinearIndex(x, y) === null) return;
			m.setTile(x, y, value);
			mapRevision++;
		},
		setFunds(amount: number): void {
			requireMicropolis().setFunds(amount);
			syncFromEngine();
		},
		setCityTax(rate: number): void {
			requireMicropolis().setCityTax(rate);
			syncFromEngine();
		},
		setPasses(passes: number): void {
			requireMicropolis().setPasses(passes);
			syncFromEngine();
		},
		setSpeed(speed: number): void {
			requireMicropolis().setSpeed(speed);
			syncFromEngine();
		},
		setGameLevel(level: GameLevel): void {
			requireMicropolis().setGameLevel(level);
			syncFromEngine();
		},
		pause(): void {
			requireMicropolis().pause();
			syncFromEngine();
		},
		resume(): void {
			requireMicropolis().resume();
			syncFromEngine();
		},
		doTool(tool: EditingTool, x: number, y: number): ToolResult {
			const r = requireMicropolis().doTool(tool, x, y);
			mapRevision++;
			return r;
		},
		loadCity(path: string): boolean {
			const ok = requireMicropolis().loadCity(path);
			syncFromEngine();
			mapRevision++;
			return ok;
		},
		generateSomeRandomCity(): void {
			commandBus.clearHistory();
			requireMicropolis().generateSomeRandomCity();
			syncFromEngine();
			mapRevision++;
		},
		clearMap(): void {
			commandBus.clearHistory();
			const engine = requireMicropolis();
			engine.clearMap();

			// MOP selects atlas sets independently from map tile IDs. Reset it too:
			// otherwise stale agricultural selectors can survive after their virtual
			// map tiles have been replaced with DIRT.
			attachedSimulator?.mopData?.fill(0);

			engine.updateMaps();
			syncFromEngine();
			mapRevision++;
		},
		generateMap(seed: number): void {
			commandBus.clearHistory();
			const engine = requireMicropolis();
			engine.generateMap(seed);
			resetMopAtlasSelectors();
			engine.updateMaps();
			syncFromEngine();
			mapRevision++;
		},
		generateTerrainForEditor(seed: number, waterDensity: number, forestDensity: number, wastelandDensity: number, isolatedTreeDensity: number, riverEnabled: boolean, riverFrom: number, riverTo: number, sinuosity: number, riverWidth: number): void {
			commandBus.clearHistory();
			const engine = requireMicropolis();
			engine.generateTerrainForEditor(seed, waterDensity, forestDensity, wastelandDensity, isolatedTreeDensity, riverEnabled, riverFrom, riverTo, sinuosity, riverWidth);
			resetMopAtlasSelectors();
			engine.updateMaps();
			syncFromEngine();
			mapRevision++;
		},
		loadTerrainTiles(width: number, height: number, tiles: readonly number[]): void {
			const engine = requireMicropolis();
			const module = attachedSimulator?.micropolisengine;
			if (!module || width !== module.WORLD_W || height !== module.WORLD_H || tiles.length !== width * height) {
				throw new RangeError('Les dimensions de ce terrain ne correspondent pas à la carte actuelle.');
			}
			commandBus.clearHistory();
			const treeFlags = module.MapTileBits.BLBNBIT.value;
			const shorelineFlag = module.MapTileBits.BULLBIT.value;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const tile = tiles[y * width + x];
					const flags = tile >= 21 && tile <= 43 ? treeFlags : tile >= 3 && tile <= 20 ? shorelineFlag : 0;
					engine.setTile(x, y, tile | flags);
				}
			}
			resetMopAtlasSelectors();
			engine.updateMaps();
			syncFromEngine();
			mapRevision++;
		},
		rebuildTerrainForEditor(x: number, y: number, waterChanged: boolean, treesChanged: boolean, preserveTargetTree: boolean): void {
			requireMicropolis().rebuildTerrainForEditor(x, y, waterChanged, treesChanged, preserveTargetTree);
			mapRevision++;
		},
		updateMaps(): void {
			requireMicropolis().updateMaps();
			mapRevision++;
		},
		updateEvaluation(): void {
			requireMicropolis().updateEvaluation();
			evaluationRevision++;
		},
		updateFundsFromEngine(): void {
			requireMicropolis().updateFunds();
			syncFromEngine();
		},
		doBudget(): void {
			requireMicropolis().doBudget();
			syncFromEngine();
			budgetModalRequested = false;
		},
		setAutoBudget(enabled: boolean): void {
			requireMicropolis().setAutoBudget(enabled);
			syncFromEngine();
		},
		/** After raw writes into `memory.mapU16`, bump observers. */
		bumpMap(): void {
			mapRevision++;
		}
	},

	registerMapPan(handler: ((x: number, y: number) => void) | null): void {
		mapPanHandler = handler;
	},

	clearBudgetModalRequest(): void {
		budgetModalRequested = false;
	},

	clearZoneStatus(): void {
		zoneStatus = { visible: false };
	},

	get attachedSimulator(): MicropolisSimulator | null {
		return attachedSimulator;
	},

	get totalFunds() {
		return totalFunds;
	},
	get cityYear() {
		return cityYear;
	},
	get cityMonth() {
		return cityMonth;
	},
	get cityName() {
		return cityName;
	},
	get cityFileName() {
		return cityFileName;
	},
	get demandR() {
		return demandR;
	},
	get demandC() {
		return demandC;
	},
	get demandI() {
		return demandI;
	},
	/** Provisional agricultural market pressure: food demand is weighted toward residents. */
	get demandA() {
		return Math.round(demandR * 0.7 + demandC * 0.2 + demandI * 0.1);
	},
	get gameLevel() {
		return gameLevel;
	},
	get simSpeed() {
		return simSpeed;
	},
	get gameSpeedIndex() {
		return gameSpeedIndex;
	},
	get simPasses() {
		return simPasses;
	},
	get simPaused() {
		return simPaused;
	},
	get cityTax() {
		return cityTax;
	},
	get mapRevision() {
		return mapRevision;
	},
	get mapCameraRevision() {
		return mapCameraRevision;
	},
	bumpMapCameraRevision() {
		mapCameraRevision++;
	},
	get budgetRevision() {
		return budgetRevision;
	},
	get evaluationRevision() {
		return evaluationRevision;
	},
	get historyRevision() {
		return historyRevision;
	},
	get messageIndex() {
		return messageIndex;
	},
	get messageX() {
		return messageX;
	},
	get messageY() {
		return messageY;
	},
	get messagePicture() {
		return messagePicture;
	},
	get messageImportant() {
		return messageImportant;
	},
	get budgetModalRequested() {
		return budgetModalRequested;
	},
	get zoneStatus() {
		return zoneStatus;
	},
	get cityPop() {
		return cityPop;
	},
	get cityScore() {
		return cityScore;
	},
	get cityTime() {
		return cityTime;
	},
	get temperatureMin() {
		return temperatureMin;
	},
	get temperatureMax() {
		return temperatureMax;
	},
	get temperatureMean() {
		return temperatureMean;
	},
	get climateReady() {
		return climateReady;
	},
	get cityClimateIndex() {
		return cityClimateIndex;
	},
	/** Revision token for scenario metadata changed through Query or scenario tools. */
	get scenarioDataRevision() {
		return zoneLockRevision;
	},
	get worldWidth() {
		return attachedSimulator?.micropolisengine?.WORLD_W ?? 0;
	},
	get worldHeight() {
		return attachedSimulator?.micropolisengine?.WORLD_H ?? 0;
	},

	/** Plain object for JSON / MCP / tests — no WASM handles. */
	getSnapshot(): MicropolisReactiveSnapshot {
		return {
			totalFunds,
			cityYear,
			cityMonth,
			cityName,
			cityFileName,
			demandR,
			demandC,
			demandI,
			gameLevel,
			simSpeed,
			simPasses,
			simPaused,
			cityTax,
			mapRevision,
			budgetRevision,
			evaluationRevision,
			historyRevision,
			messageIndex,
			messageX,
			messageY,
			messagePicture,
			messageImportant,
			budgetModalRequested,
			zoneStatus,
			cityPop,
			cityScore,
			cityTime,
			temperatureMin,
			temperatureMax,
			temperatureMean,
			climateReady,
			worldWidth: attachedSimulator?.micropolisengine?.WORLD_W ?? 0,
			worldHeight: attachedSimulator?.micropolisengine?.WORLD_H ?? 0
		};
	}
};
