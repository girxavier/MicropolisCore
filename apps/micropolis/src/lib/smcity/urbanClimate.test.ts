import { describe, expect, it } from 'vitest';
import {
	computeAnnualCityClimateIndex,
	computeCityClimateIndex,
	computeMapCityClimateIndex,
	computeMapCellClimateIndices,
	diffuseClimateIndexField,
	computeMapCellTemperatures,
	computeLocalTemperature,
	cityClimateTemperatureShift,
	shiftMonthlyClimateReference
} from './urbanClimate';

describe('urban climate aggregation', () => {
	it('averages all cells, including neutral cells', () => {
		expect(computeCityClimateIndex([100, 0, 0, 0])).toBe(25);
	});

	it('counts every occupied cell of a multi-cell object independently', () => {
		expect(computeCityClimateIndex([50, 50, 50, 0])).toBe(37.5);
	});

	it('supports signed contributions', () => {
		expect(computeCityClimateIndex([-75, 25, 0, 0])).toBe(-12.5);
	});

	it('rejects values outside the allowed cell range', () => {
		expect(() => computeCityClimateIndex([101])).toThrow(RangeError);
	});

	it('rejects an empty map', () => {
		expect(() => computeCityClimateIndex([])).toThrow(RangeError);
	});
});

describe('map-derived city climate index', () => {
	it('includes every map cell and applies scenario-wide type overrides', () => {
		const tiles = new Uint16Array(12000);
		tiles[0] = 750; // coal plant tile, +100
		expect(computeMapCityClimateIndex(tiles)).toBeCloseTo(100 / 12000);
	});

	it('rejects map buffers with the wrong dimensions', () => {
		expect(() => computeMapCityClimateIndex([750])).toThrow(RangeError);
	});
});

describe('local signed climate field', () => {
	it('keeps the source sign while diffusing to neighbours', () => {
		const source = new Float32Array(9);
		source[4] = -100;
		const spread = diffuseClimateIndexField(source, 3, 3, 1);
		expect(spread[4]).toBeLessThan(0);
		expect(spread[1]).toBeLessThan(0);
		expect(spread[1]).toBeGreaterThan(-100);
	});

	it('projects the diffused index into local temperature without feeding the annual engine', () => {
		const tiles = new Uint16Array(12000);
		tiles[0] = 750;
		const raw = computeMapCellClimateIndices(tiles);
		expect(raw[0]).toBe(100);
		const temperatures = computeMapCellTemperatures(tiles, 20, undefined, 0);
		expect(temperatures[0]).toBe(24);
	});
});

describe('annual city effect', () => {
	it('averages exactly twelve monthly records', () => {
		expect(computeAnnualCityClimateIndex(Array(12).fill(50))).toBe(50);
	});

	it('converts the annual index to degrees Celsius', () => {
		expect(cityClimateTemperatureShift(100)).toBe(1);
		expect(cityClimateTemperatureShift(-100)).toBe(-1);
	});

	it('rejects incomplete years', () => {
		expect(() => computeAnnualCityClimateIndex([1, 2, 3])).toThrow(RangeError);
	});

	it('shifts Tmin and Tmax equally before anomaly generation', () => {
		expect(shiftMonthlyClimateReference(10, 20, 0.5)).toEqual({ tmin: 10.5, tmax: 20.5 });
	});
});

describe('local temperature', () => {
	it('uses the diffused cell index at four degrees per 100 points', () => {
		expect(computeLocalTemperature(20, 50)).toBe(22);
		expect(computeLocalTemperature(20, -50)).toBe(18);
	});

	it('rejects an invalid diffused index', () => {
		expect(() => computeLocalTemperature(20, 101)).toThrow(RangeError);
	});
});
