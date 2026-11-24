/**
 * Pure calculations for the SmCity city-wide climate index.
 *
 * The engine's external CSV table assigns an index in [0, 255] and a footprint
 * weight to each tile family. These helpers mirror the annual conversion rule.
 */

export const SM_CITY_MAP_WIDTH = 120;
export const SM_CITY_MAP_HEIGHT = 100;
export const SM_CITY_MAP_CELL_COUNT = SM_CITY_MAP_WIDTH * SM_CITY_MAP_HEIGHT;

export type ClimateIndex = number;

function assertClimateIndex(value: number, label: string): void {
	if (!Number.isFinite(value) || value < 0 || value > 255) {
		throw new RangeError(`${label} must be a finite number between 0 and 255; received ${value}`);
	}
}

/** Arithmetic mean of classified objects; an empty map is climate-neutral. */
export function computeCityClimateIndex(objectIndices: ArrayLike<number>): number {
	if (objectIndices.length === 0) return 127.5;

	let total = 0;
	for (let i = 0; i < objectIndices.length; i += 1) {
		const value = objectIndices[i];
		assertClimateIndex(value, `objectIndices[${i}]`);
		total += value;
	}
	return total / objectIndices.length;
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

/** Index 0 gives -1°C, 127.5 gives 0°C, and 255 gives +1°C. */
export function cityClimateTemperatureShift(annualIndex: number): number {
	assertClimateIndex(annualIndex, 'annualIndex');
	return (2 * annualIndex / 255) - 1;
}

/** Apply the city shift equally to both reference temperatures. */
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

/** Optional local effect, centered on the neutral index 127.5. */
export function computeLocalTemperature(unitTemperature: number, localIndex: number): number {
	if (!Number.isFinite(unitTemperature)) {
		throw new RangeError('unitTemperature must be finite');
	}
	assertClimateIndex(localIndex, 'localIndex');
	return unitTemperature + 4 * ((localIndex - 127.5) / 127.5);
}
