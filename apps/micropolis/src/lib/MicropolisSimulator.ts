/// <reference path="../types/micropolisengine.d.ts" />

import type { MainModule } from '../types/micropolisengine.d.js';
import type { Micropolis, Callback, JSCallback } from '../types/micropolisengine.d.js';
import { loadMicropolisBrowserModule } from '$lib/wasm/browser';
import { createMapMopViews } from '$lib/wasm/views';

export let micropolisengine: MainModule | null = null;
let sharedSimulator: MicropolisSimulator | null = null;
let viewCount = 0;
const GLOBAL_KEY = '__MICROPOLIS_SINGLETON__';

interface GlobalStore {
	simulator?: MicropolisSimulator | null;
	engine?: MainModule | null;
	viewCount?: number;
}

function getGlobalStore(): GlobalStore {
	const g = globalThis as Record<string, unknown>;
	if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { simulator: null, engine: null, viewCount: 0 };
	return g[GLOBAL_KEY] as GlobalStore;
}


export async function loadMicropolisEngine(): Promise<MainModule> {
	const store = getGlobalStore();
	if (store.engine) {
		micropolisengine = store.engine;
		return micropolisengine;
	}

	if (micropolisengine) {
		store.engine = micropolisengine;
		return micropolisengine;
	}

	micropolisengine = await loadMicropolisBrowserModule();
	store.engine = micropolisengine;
	return micropolisengine;
}

export interface BrowserCitySaveSlot { id: string; name: string; path: string; savedAt: string; }
export interface BrowserGameSaveSlot extends BrowserCitySaveSlot { sourceId: string; sourceName: string; }

const CITY_SAVE_PREFIX = 'smcity:city-file:v1:';
const GAME_SAVE_PREFIX = 'smcity:game-save:v1:';

type BrowserFileSystemModule = MainModule & {
  FS?: { readFile: (path: string) => Uint8Array };
  FS_unlink?: (path: string) => void;
  FS_createDataFile?: (parent: string, name: string, data: Uint8Array, canRead: boolean, canWrite: boolean, canOwn: boolean) => void;
};

function citySaveId(value: string): string {
  const leaf = value.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  return leaf.replace(/\.cty$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
}

function encodeCityBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function decodeCityBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class MicropolisSimulator {

	micropolisengine: MainModule | null = null;
    micropolis: Micropolis | null = null;
    callback: JSCallback | null = null;
    mapData: Uint16Array | null = null;
    mopData: Uint16Array | null = null;
    cityFileName = '/cities/orleans.cty';
    cityFileNames = [
      "/cities/marseille.cty",
      "/cities/gap.cty",
      "/cities/orleans.cty",
      "/cities/brest.cty",
      "/cities/toulouse.cty",
    ];
    // 64 simulation ticks per month; speed 4 targets 5 seconds per month.
    gameSpeed = 1;
    keyFramesPerSecondValues = [1.1, 2.2, 6.4, 12.8];
    keyPassesValues = [1, 1, 1, 1];
    tickIntervalId: number | NodeJS.Timeout | null = null;
    framesPerSecond: number = 0;
    pausedFramesPerSecond: number = 0;
    paused: boolean = false;
    render: (() => void) = () => {};
    private disposed: boolean = false;
    private isInitialized: boolean = false;
    private hasLoadedCity: boolean = false;
    private editorSavedFunds: number | null = null;
    private currentSourceId = '';
    private currentSourceName = '';
    private renderCallbacks: Set<() => void> = new Set();
  
    constructor() {
    }

    async initialize(callback: Callback | null = null, render: (() => void) | null) {
		// If this instance was previously used, clean it up defensively
		if (this.micropolis || this.callback || this.tickIntervalId) {
			try { this.dispose(); } catch { /* ignore */ }
		}
		this.disposed = false;

		this.micropolisengine = await loadMicropolisEngine();
		if (this.micropolisengine === null) {
			console.warn('MicropolisSimulator: error loading engine module.');
			return;
		}

		this.micropolis = new micropolisengine!.Micropolis();
		if (this.micropolis === null) {
			console.warn('MicropolisSimulator: error creating Micropolis instance.');
			return;
		}

        if (!callback) {
            this.callback = null;
        } else {
            this.callback = new this.micropolisengine.JSCallback(callback);
            this.micropolis.setCallback(this.callback!, this);
        }

        this.render = render || (() => {});

        const views = createMapMopViews(this.micropolisengine, this.micropolis);
        if (views) {
            this.mapData = views.mapData;
            this.mopData = views.mopData;
        } else {
            console.warn('MicropolisSimulator: HEAPU16 view unavailable; mapData/mopData left null');
        }

        this.micropolis.init();
        this.isInitialized = true;
    }

	/** Re-bind map/mop views after WASM heap growth (loadCity, etc. detaches old subarrays). */
	syncMapViews(): boolean {
		if (!this.micropolisengine || !this.micropolis) return false;
		const views = createMapMopViews(this.micropolisengine, this.micropolis);
		if (!views) return false;
		this.mapData = views.mapData;
		this.mopData = views.mopData;
		return true;
	}

	fillMopTiles(value: number) {
		if (!this.mopData) return;

        for (let i = 0; i < this.mopData.length; i++) {
            this.mopData[i] = value;
        }
    }

	rotateMapTiles(rotation: number) {
		if (!this.mapData || !this.micropolisengine) return;

		const lomask = 0x3ff;
		const tileCount = this.micropolisengine.WORLD_W * this.micropolisengine.WORLD_H;

        for (let i = 0; i < this.mapData.length; i++) {
            let cell = this.mapData[i];
            let tile = cell & lomask;
            tile += rotation + (10 * tileCount);
            tile %= tileCount;
            cell = (cell & ~lomask) | (tile & lomask);
            this.mapData[i] = cell;
        }
    }

    tick() {
        //console.log("MicropolisSimulator: tick");
        if (this.disposed) return;
        // A paused simulator must not advance the calendar, even for a one-off UI refresh.
        if (!this.paused) {
            this.micropolis?.simTick();
            this.micropolis?.animateTiles();
        }

        // Fan out to all registered views (if any)
        if (this.renderCallbacks.size > 0) {
            for (const fn of this.renderCallbacks) {
                try { fn(); } catch (e) { console.warn('MicropolisSimulator: view render failed:', e); }
            }
        } else {
            try {
                this.render();
            } catch {}
        }
    }
    
    setGameSpeed(speed: number) {
        const safeSpeed = Math.max(0, Math.min(this.keyFramesPerSecondValues.length - 1, Math.floor(speed)));
        this.gameSpeed = safeSpeed;
        const fps = this.keyFramesPerSecondValues[safeSpeed];
        if (this.paused) this.pausedFramesPerSecond = fps;
        else this.setFramesPerSecond(fps);
        // Keep the engine's internal simulation gate enabled. The JS timer controls
        // real-time pacing; without this, pause()/resume() can restore simSpeed=0.
        this.micropolis?.setSpeed(3);
        this.micropolis?.setPasses(this.keyPassesValues[safeSpeed]);
    }

    /** Enter a frozen, no-budget editing session. */
    enterEditorMode() {
        if (!this.micropolis) return;
        if (this.editorSavedFunds === null) this.editorSavedFunds = this.micropolis.totalFunds;
        this.setPaused(true);
        this.micropolis.setFunds(1_000_000_000);
    }

    /** Restore the previous budget and resume the engine even if its internal pause flag drifted. */
    exitEditorMode(resumeSimulation = true) {
        if (!this.micropolis) return;
        if (this.editorSavedFunds !== null) {
            this.micropolis.setFunds(this.editorSavedFunds);
            this.editorSavedFunds = null;
        }
        if (resumeSimulation) this.resumeSimulation();
    }

    /** Force a clean transition from editor/loading state into a running game. */
    resumeSimulation(): void {
        if (!this.micropolis || this.disposed) return;
        const fps = this.paused
            ? (this.pausedFramesPerSecond || this.keyFramesPerSecondValues[this.gameSpeed])
            : (this.framesPerSecond || this.keyFramesPerSecondValues[this.gameSpeed]);
        this.micropolis.setSpeed(3);
        this.micropolis.setPasses(this.keyPassesValues[this.gameSpeed]);
        this.micropolis.resume();
        this.paused = false;
        this.pausedFramesPerSecond = fps;
        this.setFramesPerSecond(fps);
        this.render();
        for (const fn of this.renderCallbacks) {
            try { fn(); } catch (e) { console.warn('MicropolisSimulator: view render failed:', e); }
        }
    }

    /** Start a fresh dated play session derived from the currently loaded scenario. */
    startGameSession(): BrowserGameSaveSlot {
        this.exitEditorMode(false);
        this.resumeSimulation();
        return this.saveGameToBrowserSlot();
    }

    resetFramesPerSecond() {
        const lastFramesPerSecond = this.framesPerSecond;
        this.setFramesPerSecond(0);
        this.setFramesPerSecond(lastFramesPerSecond);
      }
    
	setFramesPerSecond(fps: number): void {
        if (this.disposed) return;
        this.framesPerSecond = fps;
    
        if (this.tickIntervalId !== null) {
            clearInterval(this.tickIntervalId);
        }
    
        if (fps <= 0) {
          return;
        }
    
        const delay = 1000 / fps;
        this.tickIntervalId = setInterval(() => this.tick(), delay);
      }
    
      setPaused(nowPaused: boolean) {
    
        const wasPaused = this.paused;
        this.paused = nowPaused;
        if (!wasPaused && nowPaused) this.micropolis?.pause();
        else if (wasPaused && !nowPaused) this.micropolis?.resume();
    
        if (!wasPaused && nowPaused) {
          if (this.framesPerSecond !== 0) {
            this.pausedFramesPerSecond = this.framesPerSecond;
          }
          this.setFramesPerSecond(0);
        } else if (wasPaused && !nowPaused) {
          this.framesPerSecond = this.pausedFramesPerSecond;
          this.setFramesPerSecond(this.framesPerSecond);
        } else {
            this.resetFramesPerSecond();
        }
    
        // Refresh the display without calling simTick(): entering pause/editor mode
        // must never advance the city by an extra simulation phase.
        this.render();
        for (const fn of this.renderCallbacks) {
            try { fn(); } catch (e) { console.warn('MicropolisSimulator: view render failed:', e); }
        }
      }

      dispose() {
        // Stop ticking and prevent further work
        if (this.tickIntervalId !== null) {
            clearInterval(this.tickIntervalId);
            this.tickIntervalId = null;
        }
        this.disposed = true;
        // Make render a no-op to avoid stale closures
        this.render = () => {};
        // Release wasm/embind objects
        try { this.callback?.delete?.(); } catch {}
        try { this.micropolis?.delete?.(); } catch {}
        this.callback = null;
        this.micropolis = null;
        this.mapData = null;
        this.mopData = null;
        this.isInitialized = false;
        this.hasLoadedCity = false;
        this.renderCallbacks.clear();
      }

      registerRenderCallback(fn: () => void) {
        if (fn) this.renderCallbacks.add(fn);
      }
      unregisterRenderCallback(fn: () => void) {
        if (fn) this.renderCallbacks.delete(fn);
      }
    listBrowserCitySaveSlots(): BrowserCitySaveSlot[] {
        if (typeof localStorage === 'undefined') return [];
        const slots: BrowserCitySaveSlot[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(CITY_SAVE_PREFIX)) continue;
            try {
                const record = JSON.parse(localStorage.getItem(key) ?? 'null') as BrowserCitySaveSlot;
                if (record?.id && record.path) slots.push(record);
            } catch { /* ignore damaged slot */ }
        }
        return slots.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }

    listBrowserGameSaveSlots(): BrowserGameSaveSlot[] {
        if (typeof localStorage === 'undefined') return [];
        const slots: BrowserGameSaveSlot[] = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(GAME_SAVE_PREFIX)) continue;
            try {
                const record = JSON.parse(localStorage.getItem(key) ?? 'null') as BrowserGameSaveSlot;
                if (record?.id && record.path && record.savedAt) slots.push(record);
            } catch { /* ignore damaged save */ }
        }
        return slots.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    }

    private persistScenarioFile(path: string, name: string, id: string): BrowserCitySaveSlot {
        const module = this.micropolisengine as BrowserFileSystemModule | null;
        if (!module?.FS?.readFile) throw new Error('Le moteur WASM ne permet pas de lire les fichiers de sauvegarde.');
        const bytes = module.FS.readFile(path);
        const slot: BrowserCitySaveSlot = { id, name, path, savedAt: new Date().toISOString() };
        localStorage.setItem(CITY_SAVE_PREFIX + id, JSON.stringify({ ...slot, bytes: encodeCityBytes(bytes) }));
        this.cityFileName = path;
        if (this.micropolis) this.micropolis.cityFileName = path;
        this.currentSourceId = 'scenario:' + id;
        this.currentSourceName = name;
        this.syncMapViews();
        this.render();
        return slot;
    }

    /** Enregistre un nouveau scénario source immuable ; un original existant n'est jamais écrasé. */
    saveCurrentCityToBrowserSlot(): BrowserCitySaveSlot {
        if (!this.micropolis) throw new Error('Aucune ville active à enregistrer.');
        const name = this.micropolis.cityName || citySaveId(this.cityFileName || 'scenario');
        return this.saveCityAsBrowserSlot(name);
    }

    saveCityAsBrowserSlot(name: string): BrowserCitySaveSlot {
        if (!this.micropolis || !this.micropolisengine || typeof localStorage === 'undefined') throw new Error('La sauvegarde locale du navigateur est indisponible.');
        const cleanName = name.trim();
        if (!cleanName) throw new Error('Saisissez un nom de scénario.');
        const id = citySaveId(cleanName);
        if (this.cityFileNames.some((path) => citySaveId(path) === id)) {
            throw new Error('Ce nom est reserve a une des cinq villes d’origine. Choisissez un autre nom pour votre scenario.');
        }
        if (localStorage.getItem(CITY_SAVE_PREFIX + id)) {
            throw new Error('Un scénario porte déjà ce nom. Choisissez un autre nom : les scénarios sources ne sont jamais écrasés.');
        }
        const path = '/cities/user-' + id + '.cty';
        const editorFunds = this.micropolis.totalFunds;
        if (this.editorSavedFunds !== null) this.micropolis.setFunds(this.editorSavedFunds);
        try {
            this.micropolis.setCityName(cleanName);
            this.micropolis.saveCityAs(path);
            this.micropolis.setCityName(cleanName);
        } finally {
            if (this.editorSavedFunds !== null) this.micropolis.setFunds(editorFunds);
        }
        return this.persistScenarioFile(path, cleanName, id);
    }

    private restoreBrowserCityFile(path: string, encodedBytes: string): boolean {
        const module = this.micropolisengine as BrowserFileSystemModule | null;
        const engine = this.micropolis;
        if (!module || !engine) return false;
        const bytes = decodeCityBytes(encodedBytes);
        const filename = path.split('/').pop() ?? 'scenario.cty';
        try { module.FS_unlink?.(path); } catch { /* file did not exist */ }
        if (!module.FS_createDataFile) throw new Error('Le moteur WASM ne permet pas de recharger les sauvegardes locales.');
        module.FS_createDataFile('/cities', filename, bytes, true, true, true);
        return engine.loadCity(path);
    }

    loadBrowserCitySaveSlot(idOrName: string): boolean {
        if (typeof localStorage === 'undefined') return false;
        const id = citySaveId(idOrName);
        const raw = localStorage.getItem(CITY_SAVE_PREFIX + id);
        if (!raw) return false;
        const record = JSON.parse(raw) as BrowserCitySaveSlot & { bytes: string };
        const loaded = this.restoreBrowserCityFile(record.path, record.bytes);
        if (loaded && this.micropolis) {
            this.micropolis.setCityName(record.name);
            this.cityFileName = record.path;
            this.currentSourceId = 'scenario:' + record.id;
            this.currentSourceName = record.name;
            this.hasLoadedCity = true;
            if (this.editorSavedFunds !== null) {
                this.editorSavedFunds = this.micropolis.totalFunds;
                this.micropolis.setFunds(1_000_000_000);
                this.micropolis.pause();
            }
            this.syncMapViews();
            this.render();
        }
        return loaded;
    }

    /** Crée une sauvegarde datée de la partie sans toucher au scénario source. */
    saveGameToBrowserSlot(): BrowserGameSaveSlot {
        if (!this.micropolis || !this.micropolisengine || typeof localStorage === 'undefined') {
            throw new Error('La sauvegarde locale du navigateur est indisponible.');
        }
        const module = this.micropolisengine as BrowserFileSystemModule;
        if (!module.FS?.readFile) throw new Error('Le moteur WASM ne permet pas de lire les fichiers de sauvegarde.');
        const name = this.currentSourceName || this.micropolis.cityName || citySaveId(this.cityFileName || 'scenario');
        const sourceId = this.currentSourceId || ('builtin:' + citySaveId(this.cityFileName || name));
        const savedAt = new Date().toISOString();
        const stamp = savedAt.replace(/[:.]/g, '-');
        const baseId = citySaveId(name) + '-' + stamp;
        let id = baseId;
        let suffix = 1;
        while (localStorage.getItem(GAME_SAVE_PREFIX + id)) id = baseId + '-' + suffix++;
        const path = '/cities/game-' + id + '.cty';
        this.micropolis.setCityName(name);
        this.micropolis.saveCityAs(path);
        this.micropolis.setCityName(name);
        const bytes = module.FS.readFile(path);
        const slot: BrowserGameSaveSlot = { id, name, sourceId, sourceName: name, path, savedAt };
        localStorage.setItem(GAME_SAVE_PREFIX + id, JSON.stringify({ ...slot, bytes: encodeCityBytes(bytes) }));
        this.cityFileName = path;
        this.micropolis.cityFileName = path;
        this.currentSourceId = sourceId;
        this.currentSourceName = name;
        this.syncMapViews();
        this.render();
        return slot;
    }

    loadBrowserGameSaveSlot(id: string): boolean {
        if (typeof localStorage === 'undefined') return false;
        const raw = localStorage.getItem(GAME_SAVE_PREFIX + id);
        if (!raw) return false;
        const record = JSON.parse(raw) as BrowserGameSaveSlot & { bytes: string };
        const loaded = this.restoreBrowserCityFile(record.path, record.bytes);
        if (loaded && this.micropolis) {
            this.micropolis.setCityName(record.name);
            this.cityFileName = record.path;
            this.currentSourceId = record.sourceId;
            this.currentSourceName = record.sourceName || record.name;
            this.hasLoadedCity = true;
            if (this.editorSavedFunds !== null) {
                this.editorSavedFunds = this.micropolis.totalFunds;
                this.micropolis.setFunds(1_000_000_000);
                this.micropolis.pause();
            }
            this.syncMapViews();
            this.render();
        }
        return loaded;
    }

	loadDefaultCityOnce() {
		if (this.micropolis && !this.hasLoadedCity) {
			this.micropolis.loadCity(this.cityFileName);
			this.currentSourceId = 'builtin:' + citySaveId(this.cityFileName);
			this.currentSourceName = this.micropolis.cityName;
			this.hasLoadedCity = true;
			this.syncMapViews();
		}
	}

    loadCity(fileName: string): boolean {
        if (!this.micropolis) return false;
        const loaded = this.micropolis.loadCity(fileName);
        if (loaded) {
            this.cityFileName = fileName;
            const source = this.listBrowserCitySaveSlots().find((slot) => slot.path === fileName);
            this.currentSourceId = source ? 'scenario:' + source.id : 'builtin:' + citySaveId(fileName);
            this.currentSourceName = this.micropolis.cityName;
            this.hasLoadedCity = true;
            if (this.editorSavedFunds !== null) {
                this.editorSavedFunds = this.micropolis.totalFunds;
                this.micropolis.setFunds(1_000_000_000);
                this.micropolis.pause();
            }
            this.syncMapViews();
            this.render();
        }
        return loaded;
    }

    /** Load one of Micropolis' built-in scenarios through the C++ engine. */
    loadScenario(scenario: number): void {
        if (!this.micropolis || !this.micropolisengine) return;

        const scenarios = [
            this.micropolisengine.Scenario.SC_NONE,
            this.micropolisengine.Scenario.SC_DULLSVILLE,
            this.micropolisengine.Scenario.SC_SAN_FRANCISCO,
            this.micropolisengine.Scenario.SC_HAMBURG,
            this.micropolisengine.Scenario.SC_BERN,
            this.micropolisengine.Scenario.SC_TOKYO,
            this.micropolisengine.Scenario.SC_DETROIT,
            this.micropolisengine.Scenario.SC_BOSTON,
            this.micropolisengine.Scenario.SC_RIO
        ];

        const scenarioValue = scenarios[scenario];
        if (scenarioValue === undefined) return;

        this.micropolis.loadScenario(scenarioValue);
        this.cityFileName = '';
        this.currentSourceId = 'scenario:' + citySaveId(this.micropolis.cityName);
        this.currentSourceName = this.micropolis.cityName;
        this.hasLoadedCity = true;

        if (this.editorSavedFunds !== null) {
            this.editorSavedFunds = this.micropolis.totalFunds;
            this.micropolis.setFunds(1_000_000_000);
            this.micropolis.pause();
        }

        this.syncMapViews();
        this.render();
    }
}

export async function getSharedSimulator(callback: Callback | null, render: (() => void) | null): Promise<MicropolisSimulator> {
    const store = getGlobalStore();
    if (store.simulator) {
        sharedSimulator = store.simulator;
    }

    if (!sharedSimulator) {
        sharedSimulator = new MicropolisSimulator();
        await sharedSimulator.initialize(callback, render);
        sharedSimulator.registerRenderCallback(render || (() => {}));
        sharedSimulator.loadDefaultCityOnce();
        sharedSimulator.micropolis!.enableDisasters = true;
        sharedSimulator.setGameSpeed(sharedSimulator.gameSpeed);
        // Start paused; the view decides whether to resume normal play or stay in editor mode.
        sharedSimulator.setPaused(true);
        store.simulator = sharedSimulator;
    } else {
        // Keep existing wasm/callbacks; just attach this view's render
        sharedSimulator.registerRenderCallback(render || (() => {}));
    }

    // Attach view and resume ticking if needed
    viewCount += 1;
    store.viewCount = (store.viewCount || 0) + 1;
    // MicropolisView owns the mode decision and explicitly resumes only normal play.
    return sharedSimulator;
}

export function releaseSharedSimulator(render?: () => void) {
    const store = getGlobalStore();
    if (store.simulator) {
        if (render) store.simulator.unregisterRenderCallback(render);
        store.viewCount = Math.max(0, (store.viewCount || 0) - 1);
        viewCount = store.viewCount;
        if (store.viewCount === 0) {
            try { store.simulator.setPaused(true); } catch {}
        }
    }
}

