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
const CITY_SAVE_PREFIX = 'smcity:city-file:v1:';
function citySaveId(value: string): string {
    const leaf = value.trim().replace(/\\/g, '/').split('/').pop() ?? '';
    return leaf.replace(/\\.cty$/i, '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'scenario';
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
    // 16 phases per city-time unit × 4 city-time units per month = 64 ticks/month.
    // At 1.1 / 2.2 / 6.4 ticks per second: about 58 / 29 / 10 seconds per month.
    gameSpeed = 1;
    keyFramesPerSecondValues = [1.1, 2.2, 6.4];
    keyPassesValues = [1, 1, 1];
    tickIntervalId: number | NodeJS.Timeout | null = null;
    framesPerSecond: number = 0;
    pausedFramesPerSecond: number = 0;
    paused: boolean = false;
    render: (() => void) = () => {};
    private disposed: boolean = false;
    private isInitialized: boolean = false;
    private hasLoadedCity: boolean = false;
    private editorSavedFunds: number | null = null;
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
        this.micropolis?.setPasses(this.keyPassesValues[safeSpeed]);
    }

    /** Enter a frozen, no-budget editing session. */
    enterEditorMode() {
        if (!this.micropolis) return;
        if (this.editorSavedFunds === null) this.editorSavedFunds = this.micropolis.totalFunds;
        this.setPaused(true);
        this.micropolis.setFunds(1_000_000_000);
    }

    /** Restore the previous budget and resume normal simulation. */
    exitEditorMode(resumeSimulation = true) {
        if (!this.micropolis) return;
        if (this.editorSavedFunds !== null) {
            this.micropolis.setFunds(this.editorSavedFunds);
            this.editorSavedFunds = null;
        }
        if (resumeSimulation) this.setPaused(false);
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

    private persistCityFile(path: string, name: string, id: string): BrowserCitySaveSlot {
        const module = this.micropolisengine;
        if (!module?.FS_readFile) throw new Error('Le moteur WASM doit être recompilé avec FS_readFile pour sauvegarder les cartes.');
        const bytes = module.FS_readFile(path);
        const slot: BrowserCitySaveSlot = { id, name, path, savedAt: new Date().toISOString() };
        localStorage.setItem(CITY_SAVE_PREFIX + id, JSON.stringify({ ...slot, bytes: encodeCityBytes(bytes) }));
        this.cityFileName = path;
        if (this.micropolis) this.micropolis.cityFileName = path;
        this.syncMapViews();
        this.render();
        return slot;
    }

    saveCurrentCityToBrowserSlot(): BrowserCitySaveSlot {
        if (!this.micropolis || !this.micropolisengine || typeof localStorage === 'undefined') throw new Error('Sauvegarde locale indisponible.');
        let path = String(this.micropolis.cityFileName || this.cityFileName || '');
        if (!path || !path.endsWith('.cty')) {
            const id = citySaveId(this.micropolis.cityName || 'scenario');
            path = `/cities/${id}.cty`;
            this.micropolis.saveCityAs(path);
        } else {
            this.micropolis.saveCity();
        }
        const id = citySaveId(path);
        return this.persistCityFile(path, this.micropolis.cityName || id, id);
    }

    saveCityAsBrowserSlot(name: string, overwrite = false): BrowserCitySaveSlot {
        if (!this.micropolis || !this.micropolisengine || typeof localStorage === 'undefined') throw new Error('Sauvegarde locale indisponible.');
        const id = citySaveId(name);
        const key = CITY_SAVE_PREFIX + id;
        if (localStorage.getItem(key) && !overwrite) throw new Error(`Le scénario « ${name} » existe déjà.`);
        const path = `/cities/${id}.cty`;
        this.micropolis.saveCityAs(path);
        return this.persistCityFile(path, name.trim(), id);
    }

    loadBrowserCitySaveSlot(idOrName: string): boolean {
        const module = this.micropolisengine;
        const engine = this.micropolis;
        if (!module || !engine || typeof localStorage === 'undefined') return false;
        const id = citySaveId(idOrName);
        const raw = localStorage.getItem(CITY_SAVE_PREFIX + id);
        if (!raw) return false;
        const record = JSON.parse(raw) as BrowserCitySaveSlot & { bytes: string };
        const bytes = decodeCityBytes(record.bytes);
        const filename = record.path.split('/').pop() ?? `${id}.cty`;
        try { module.FS_unlink?.(record.path); } catch { /* file did not exist */ }
        module.FS_createDataFile('/cities', filename, bytes, true, true, true);
        const loaded = engine.loadCity(record.path);
        if (loaded) {
            this.cityFileName = record.path;
            this.hasLoadedCity = true;
            this.syncMapViews();
            this.render();
        }
        return loaded;
    }

    loadDefaultCityOnce() {
		if (this.micropolis && !this.hasLoadedCity) {
			this.micropolis.loadCity(this.cityFileName);
			this.hasLoadedCity = true;
			this.syncMapViews();
		}
	}

    loadCity(fileName: string): boolean {
        if (!this.micropolis) return false;
        const loaded = this.micropolis.loadCity(fileName);
        if (loaded) {
            this.cityFileName = fileName;
            this.hasLoadedCity = true;
            if (this.editorSavedFunds !== null) {
                this.editorSavedFunds = this.micropolis.totalFunds;
                this.micropolis.setFunds(1_000_000_000);
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
        this.hasLoadedCity = true;

        if (this.editorSavedFunds !== null) {
            this.editorSavedFunds = this.micropolis.totalFunds;
            this.micropolis.setFunds(1_000_000_000);
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

