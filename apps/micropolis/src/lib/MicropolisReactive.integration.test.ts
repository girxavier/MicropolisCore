import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { micropolisReactive } from './MicropolisReactive.svelte';
import type { MicropolisSimulator } from './MicropolisSimulator';
import { loadMicropolisMainModule } from './wasm/node';
import { createMapMopViews } from './wasm/views';
import type { MainModule } from '../types/micropolisengine.d.js';
import type { JSCallback, Micropolis } from '../types/micropolisengine.d.js';

describe('micropolisReactive bridge', () => {
	let engine: MainModule;
	let micropolis: Micropolis;
	let jsCallbackWrapper: JSCallback;

	beforeAll(async () => {
		engine = await loadMicropolisMainModule();
		micropolis = new engine.Micropolis();
		jsCallbackWrapper = new engine.JSCallback(micropolisReactive.engineCallback);
		micropolis.setCallback(jsCallbackWrapper, {});
		const mm = createMapMopViews(engine, micropolis);
		micropolis.init();

		let simulatorLike: MicropolisSimulator;
		simulatorLike = {
			micropolis,
			micropolisengine: engine,
			mapData: mm?.mapData ?? null,
			mopData: mm?.mopData ?? null,
			syncMapViews: () => {
				const views = createMapMopViews(engine, micropolis);
				simulatorLike.mapData = views?.mapData ?? null;
				simulatorLike.mopData = views?.mopData ?? null;
			}
		} as MicropolisSimulator;

		micropolisReactive.attach(simulatorLike);
	});

	afterAll(() => {
		micropolisReactive.detach();
		try { micropolis.delete(); } catch { /* ignore */ }
		try { jsCallbackWrapper.delete(); } catch { /* ignore */ }
	});

	it('exposes wasm module constants after attach', () => {
		const m = micropolisReactive.wasmModule;
		expect(m?.WORLD_W).toBe(engine.WORLD_W);
		expect(micropolisReactive.worldWidth).toBe(engine.WORLD_W);
		expect(micropolisReactive.worldHeight).toBe(engine.WORLD_H);
	});

	it('memory helpers match world size', () => {
		const b = micropolisReactive.memory.bounds();
		expect(b?.w).toBe(engine.WORLD_W);
		expect(b?.h).toBe(engine.WORLD_H);
		expect(micropolisReactive.memory.tileLinearIndex(0, 0)).toBe(0);
		expect(micropolisReactive.memory.tileLinearIndex(engine.WORLD_W - 1, engine.WORLD_H - 1)).toBe(engine.WORLD_W * engine.WORLD_H - 1);
		expect(micropolisReactive.memory.tileLinearIndex(engine.WORLD_W, 0)).toBeNull();
		const mapU16 = micropolisReactive.memory.mapU16;
		if (mapU16) expect(mapU16.length).toBe(micropolisReactive.memory.mapWordLength);
	});

	it('loads city and syncs reactive + peek scalars', () => {
		const ok = micropolis.loadCity('/cities/haight.cty');
		expect(ok).toBe(true);
		micropolisReactive.syncFromEngine();
		expect(micropolisReactive.totalFunds).toBe(micropolis.totalFunds);
		const peek = micropolisReactive.peek.scalars();
		expect(peek).not.toBeNull();
		expect(peek!.totalFunds).toBe(micropolis.totalFunds);
		const snap = micropolisReactive.getSnapshot();
		expect(snap.worldWidth).toBe(engine.WORLD_W);
		expect(snap.totalFunds).toBe(micropolis.totalFunds);
	});

	it('loads all five SmCity maps and initializes their climate profiles', () => {
		const cities = ['/cities/marseille.cty', '/cities/gap.cty', '/cities/orleans.cty', '/cities/brest.cty', '/cities/toulouse.cty'];
		for (const city of cities) {
			expect(micropolis.loadCity(city)).toBe(true);
			micropolisReactive.syncFromEngine();
			expect(micropolis.climateReady).toBe(true);
			expect(Number.isFinite(micropolis.temperatureMin)).toBe(true);
			expect(Number.isFinite(micropolis.temperatureMax)).toBe(true);
			expect(micropolisReactive.climateReady).toBe(true);
		}
	});

	it('generates deterministic weather categories and bounded unit values for all five SmCity cities', () => {
		const cities = ['/cities/marseille.cty', '/cities/gap.cty', '/cities/orleans.cty', '/cities/brest.cty', '/cities/toulouse.cty'];
		for (const city of cities) {
			expect(micropolis.loadCity(city)).toBe(true);
			const forecast = micropolis.getClimateForecast(8) as Array<{
				cityTime: number;
				weatherCode: number;
				precipitationMm: number;
				sunshineHours: number;
			}>;
			expect(forecast.length).toBeGreaterThan(0);
			for (const reading of forecast) {
				expect(Number.isInteger(reading.weatherCode)).toBe(true);
				expect(reading.weatherCode).toBeGreaterThanOrEqual(0);
				expect(reading.weatherCode).toBeLessThanOrEqual(6);
				expect(Number.isFinite(reading.precipitationMm)).toBe(true);
				expect(reading.precipitationMm).toBeGreaterThanOrEqual(0);
				expect(Number.isFinite(reading.sunshineHours)).toBe(true);
				expect(reading.sunshineHours).toBeGreaterThanOrEqual(0);
			}
			const repeated = micropolis.getClimateForecast(8) as typeof forecast;
			expect(repeated).toEqual(forecast);
		}
	});

	it('routes a Query tool click through WASM to the reactive zone-status panel', () => {
		const x = 10;
		const y = 12;
		micropolisReactive.clearZoneStatus();
		const result = micropolisReactive.poke.doTool(engine.EditingTool.TOOL_QUERY, x, y);
		expect(result.value).toBe(engine.ToolResult.TOOLRESULT_OK.value);
		const status = micropolisReactive.zoneStatus;
		expect(status.visible).toBe(true);
		if (status.visible) {
			expect(status.x).toBe(x);
			expect(status.y).toBe(y);
			expect(status.tileId).toBe(micropolis.getTile(x, y));
		}
	});

	it('keeps WASM evolution locks isolated by exact zone-center coordinates', () => {
		micropolis.clearZoneLocks();
		expect(micropolis.setZoneLocked(10, 12, true)).toBe(true);
		expect(micropolis.setZoneLocked(14, 12, true)).toBe(true);
		expect(micropolis.isZoneLocked(10, 12)).toBe(true);
		expect(micropolis.isZoneLocked(14, 12)).toBe(true);
		expect(micropolis.isZoneLocked(11, 12)).toBe(false);

		micropolis.setZoneLocked(10, 12, false);
		expect(micropolis.isZoneLocked(10, 12)).toBe(false);
		expect(micropolis.isZoneLocked(14, 12)).toBe(true);
		micropolis.clearZoneLocks();
	});

	it('peek.tile matches getTile', () => {
		const a = micropolis.getTile(10, 12);
		const b = micropolisReactive.peek.tile(10, 12);
		expect(b).toBe(a);
	});

	it('poke.setFunds updates engine and reactive mirror', () => {
		const target = 42_500;
		micropolisReactive.poke.setFunds(target);
		expect(micropolis.totalFunds).toBe(target);
		expect(micropolisReactive.totalFunds).toBe(target);
		expect(micropolisReactive.peek.scalars()?.totalFunds).toBe(target);
	});

	it('poke.bumpMap increments mapRevision', () => {
		const before = micropolisReactive.mapRevision;
		micropolisReactive.poke.bumpMap();
		expect(micropolisReactive.mapRevision).toBe(before + 1);
	});
});
