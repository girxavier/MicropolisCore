import { afterEach, describe, expect, it, vi } from 'vitest';
import { MicropolisSimulator } from './MicropolisSimulator';
import type { Micropolis } from '../types/micropolisengine.d.js';

describe('MicropolisSimulator speed and resume controls', () => {
  afterEach(() => vi.useRealTimers());

  it('adds speed 4 at 12.8 ticks per second (about 5 seconds per month)', () => {
    vi.useFakeTimers();
    const simulator = new MicropolisSimulator();
    const engine = { setSpeed: vi.fn(), setPasses: vi.fn() } as unknown as Micropolis;
    simulator.micropolis = engine;
    simulator.setGameSpeed(3);
    expect(simulator.gameSpeed).toBe(3);
    expect(simulator.framesPerSecond).toBe(12.8);
    expect(engine.setSpeed).toHaveBeenCalledWith(3);
    expect(engine.setPasses).toHaveBeenCalledWith(1);
    simulator.dispose();
  });

  it('does not restore a stale paused speed after a running speed change', () => {
    vi.useFakeTimers();
    const simulator = new MicropolisSimulator();
    const engine = { setSpeed: vi.fn(), setPasses: vi.fn(), resume: vi.fn() } as unknown as Micropolis;
    simulator.micropolis = engine;
    simulator.gameSpeed = 3;
    simulator.paused = false;
    simulator.framesPerSecond = 12.8;
    simulator.pausedFramesPerSecond = 2.2;

    simulator.resumeSimulation();

    expect(simulator.framesPerSecond).toBe(12.8);
    simulator.dispose();
  });

  it('forces the engine and JS clock to resume after an editor transition', () => {
    vi.useFakeTimers();
    const simulator = new MicropolisSimulator();
    const engine = { setSpeed: vi.fn(), setPasses: vi.fn(), resume: vi.fn() } as unknown as Micropolis;
    simulator.micropolis = engine;
    simulator.gameSpeed = 3;
    simulator.paused = true;
    simulator.pausedFramesPerSecond = 12.8;
    simulator.resumeSimulation();
    expect(engine.setSpeed).toHaveBeenCalledWith(3);
    expect(engine.setPasses).toHaveBeenCalledWith(1);
    expect(engine.resume).toHaveBeenCalledOnce();
    expect(simulator.paused).toBe(false);
    expect(simulator.framesPerSecond).toBe(12.8);
    simulator.dispose();
  });
});
