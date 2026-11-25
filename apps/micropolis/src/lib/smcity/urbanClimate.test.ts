import { describe, expect, it } from 'vitest';
import {
	computeAnnualCityClimateIndex,
	computeCityClimateIndex,
	computeLocalTemperature,
	cityClimateTemperatureShift,
	shiftMonthlyClimateReference
} from './urbanClimate';

describe('urban climate aggregation', () => {
	it('averages classified objects rather than empty map cells', () => {
		expect(computeCityClimateIndex([255, 0])).toBe(127.5);
	});

	it('uses the neutral midpoint when the map has no classified objects', () => {
		expect(computeCityClimateIndex([])).toBe(127.5);
	});

	it('keeps fractional values such as the low-density baseline', () => {
		expect(computeCityClimateIndex([127.5, 127.5])).toBe(127.5);
	});

	it('rejects values outside the 0–255 range', () => {
		expect(() => computeCityClimateIndex([256])).toThrow(RangeError);
	});
});

describe('annual city effect', () => {
	it('averages exactly twelve monthly records', () => {
		expect(computeAnnualCityClimateIndex(Array(12).fill(127.5))).toBe(127.5);
	});

	it('converts the annual index linearly to degrees Celsius', () => {
		expect(cityClimateTemperatureShift(0)).toBe(-1);
		expect(cityClimateTemperatureShift(127.5)).toBe(0);
		expect(cityClimateTemperatureShift(255)).toBe(1);
	});

	it('rejects incomplete years', () => {
		expect(() => computeAnnualCityClimateIndex([1, 2, 3])).toThrow(RangeError);
	});

	it('shifts Tmin and Tmax equally before anomaly generation', () => {
		expect(shiftMonthlyClimateReference(10, 20, 0.5)).toEqual({ tmin: 10.5, tmax: 20.5 });
	});
});

describe('local temperature helper', () => {
	it('centers local effects on the neutral index', () => {
		expect(computeLocalTemperature(20, 127.5)).toBe(20);
		expect(computeLocalTemperature(20, 255)).toBe(24);
		expect(computeLocalTemperature(20, 0)).toBe(16);
	});
});
