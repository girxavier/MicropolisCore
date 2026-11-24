import { describe, expect, it } from 'vitest';
import {
	computeAnnualCityClimateIndex,
	computeCityClimateIndex,
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
