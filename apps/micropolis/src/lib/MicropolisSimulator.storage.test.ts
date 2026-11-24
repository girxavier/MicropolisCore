import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicropolisSimulator } from './MicropolisSimulator';
import type { MainModule, Micropolis } from '../types/micropolisengine.d.js';

function makeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, String(value)); }
  } as Storage;
}

describe('scenario sources and dated game saves', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps scenario sources immutable and stores every play save separately', () => {
    vi.stubGlobal('localStorage', makeStorage());
    const files = new Map<string, Uint8Array>();
    const engine = {
      FS: { readFile: (path: string) => files.get(path) ?? new Uint8Array() },
      FS_unlink: (path: string) => { files.delete(path); },
      FS_createDataFile: (parent: string, name: string, data: Uint8Array) => {
        files.set(parent + '/' + name, new Uint8Array(data));
      }
    } as unknown as MainModule;
    type MockCity = {
      cityName: string;
      cityFileName: string;
      totalFunds: number;
      setCityName(name: string): void;
      setFunds(amount: number): void;
      saveCityAs(path: string): void;
      loadCity(path: string): boolean;
    };
    const city: MockCity = {
      cityName: 'Projet test',
      cityFileName: '/cities/orleans.cty',
      totalFunds: 50000,
      setCityName(name: string) { this.cityName = name; },
      setFunds(amount: number) { this.totalFunds = amount; },
      saveCityAs(path: string) {
        files.set(path, new Uint8Array([1, 2, 3]));
        this.cityFileName = path;
        this.cityName = path.split('/').pop()?.replace(/\\.cty$/, '') ?? 'city';
      },
      loadCity(path: string) { this.cityFileName = path; return files.has(path); }
    } as unknown as Micropolis;
    const simulator = new MicropolisSimulator();
    simulator.micropolisengine = engine;
    simulator.micropolis = city;
    simulator.syncMapViews = () => true;
    simulator.render = () => {};

    const source = simulator.saveCityAsBrowserSlot('Projet test');
    const sourceKey = 'smcity:city-file:v1:' + source.id;
    const originalRecord = localStorage.getItem(sourceKey);
    expect(originalRecord).not.toBeNull();
    expect(() => simulator.saveCityAsBrowserSlot('Projet test')).toThrow(/jamais écrasés/);
    expect(() => simulator.saveCityAsBrowserSlot('Orléans')).toThrow(/cinq villes d’origine/);

    const first = simulator.saveGameToBrowserSlot();
    const second = simulator.saveGameToBrowserSlot();
    expect(first.id).not.toBe(second.id);
    expect(first.sourceId).toBe('scenario:' + source.id);
    expect(simulator.listBrowserGameSaveSlots()).toHaveLength(2);
    expect(localStorage.getItem(sourceKey)).toBe(originalRecord);
    simulator.dispose();
  });
});
