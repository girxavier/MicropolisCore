/**
 * Pure calculations for the SmCity urban-climate layer.
 *
 * This module deliberately does not alter the baseline climate engine. It provides
 * the map aggregation and temperature-shift primitives that can be connected to
 * construction metadata and the existing climate model in a later integration step.
 */

export const SM_CITY_MAP_WIDTH = 120;
export const SM_CITY_MAP_HEIGHT = 100;
export const SM_CITY_MAP_CELL_COUNT = SM_CITY_MAP_WIDTH * SM_CITY_MAP_HEIGHT;

export type ClimateIndex = number;

function assertClimateIndex(value: number, label: string): void {
	if (!Number.isFinite(value) || value < -100 || value > 100) {
		throw new RangeError(`${label} must be a finite number between -100 and +100; received ${value}`);
	}
}

/**
 * Calculates the arithmetic mean over every map cell.
 * Empty, cleared and otherwise neutral cells must be represented by 0 and remain
 * in the denominator. Multi-cell objects are represented by one value per cell.
 */
export function computeCityClimateIndex(cellIndices: ArrayLike<number>): number {
	if (cellIndices.length === 0) {
		throw new RangeError('The climate-index map must contain at least one cell');
	}

	let total = 0;
	for (let i = 0; i < cellIndices.length; i += 1) {
		const value = cellIndices[i];
		assertClimateIndex(value, `cellIndices[${i}]`);
		total += value;
	}

	return total / cellIndices.length;
}

/** Average the twelve monthly city indices of one complete calendar year. */
export function computeAnnualCityClimateIndex(monthlyIndices: readonly number[]): number {
	if (monthlyIndices.length !== 12) {
		throw new RangeError(`Expected 12 monthly climate indices; received ${monthlyIndices.length}`);
	}

	let total = 0;
	for (let month = 0; month < 12; month += 1) {
		assertClimateIndex(monthlyIndices[month], `monthlyIndices[${month}]`);
		total += monthlyIndices[month];
	}
	return total / 12;
}

/** +100 gives +1°C; -100 gives -1°C. */
export function cityClimateTemperatureShift(annualIndex: number): number {
	assertClimateIndex(annualIndex, 'annualIndex');
	return annualIndex / 100;
}

/** Apply the city shift to both monthly reference temperatures, before anomalies. */
export function shiftMonthlyClimateReference(
	tminReference: number,
	tmaxReference: number,
	cityShiftCelsius: number
): { tmin: number; tmax: number } {
	if (!Number.isFinite(tminReference) || !Number.isFinite(tmaxReference) ||
		!Number.isFinite(cityShiftCelsius) || tminReference > tmaxReference) {
		throw new RangeError('Invalid monthly climate reference or city temperature shift');
	}
	return {
		tmin: tminReference + cityShiftCelsius,
		tmax: tmaxReference + cityShiftCelsius
	};
}

/**
 * Local temperature uses the diffused cell index, not the raw index used for
 * city-wide aggregation: T_cell = T_unit + 4 * (I_diffused / 100).
 */
export function computeLocalTemperature(unitTemperature: number, diffusedCellIndex: number): number {
	if (!Number.isFinite(unitTemperature)) {
		throw new RangeError('unitTemperature must be finite');
	}
	assertClimateIndex(diffusedCellIndex, 'diffusedCellIndex');
	return unitTemperature + 4 * (diffusedCellIndex / 100);
}
