import { getConstructionClimateRule, resolveConstructionTypeFromTileId } from './constructionCatalog';
import type { ScenarioData } from './scenarioData';

/**
 * Pure calculations for the SmCity climate-index layer.
 * The local temperature field is a cartographic/gameplay data layer only; it never
 * feeds back into the annual climate engine.
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

/**
 * Calculate the raw city index from the actual map buffer. Every map cell is
 * included; legacy tile IDs without an unambiguous SmCity mapping contribute 0.
 */
export function computeMapCityClimateIndex(mapTiles: ArrayLike<number>, scenario?: ScenarioData): number {
	if (mapTiles.length !== SM_CITY_MAP_CELL_COUNT) {
		throw new RangeError(`Expected ${SM_CITY_MAP_CELL_COUNT} map cells; received ${mapTiles.length}`);
	}
	let total = 0;
	for (let index = 0; index < mapTiles.length; index += 1) {
		const typeId = resolveConstructionTypeFromTileId(mapTiles[index]);
		if (!typeId) continue;
		const rule = getConstructionClimateRule(typeId, scenario);
		if (rule.kind === 'fixed') total += rule.value;
		else if (rule.kind === 'range') total += (rule.min + rule.max) / 2;
	}
	return total / mapTiles.length;
}

/** One signed climate-index value per map cell; unknown/neutral tiles contribute 0. */
export function computeMapCellClimateIndices(mapTiles: ArrayLike<number>, scenario?: ScenarioData): Float32Array {
	if (mapTiles.length !== SM_CITY_MAP_CELL_COUNT) throw new RangeError(`Expected ${SM_CITY_MAP_CELL_COUNT} map cells; received ${mapTiles.length}`);
	const field = new Float32Array(mapTiles.length);
	for (let index = 0; index < mapTiles.length; index += 1) {
		const typeId = resolveConstructionTypeFromTileId(mapTiles[index]);
		if (!typeId) continue;
		const rule = getConstructionClimateRule(typeId, scenario);
		if (rule.kind === 'fixed') field[index] = rule.value;
		else if (rule.kind === 'range') field[index] = (rule.min + rule.max) / 2;
		// Unassigned construction types deliberately contribute a neutral index of 0.
	}
	return field;
}

/**
 * Signed Smooth-3 diffusion: normalized 3x3 binomial kernel [1 2 1; 2 4 2; 1 2 1].
 * Negative values remain negative. Edges normalize over in-bounds neighbours; no wrap.
 */
export function diffuseClimateIndexField(rawField: ArrayLike<number>, width = SM_CITY_MAP_WIDTH, height = SM_CITY_MAP_HEIGHT, iterations = 1): Float32Array {
	if (width < 1 || height < 1 || rawField.length !== width * height || !Number.isInteger(iterations) || iterations < 0) {
		throw new RangeError('Invalid climate diffusion dimensions or iteration count');
	}
	let source = Float32Array.from(rawField);
	for (let i = 0; i < source.length; i += 1) assertClimateIndex(source[i], `rawField[${i}]`);
	const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1];
	for (let pass = 0; pass < iterations; pass += 1) {
		const target = new Float32Array(source.length);
		for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
			let weighted = 0, weightTotal = 0;
			for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
				const nx = x + dx, ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
				const weight = weights[(dy + 1) * 3 + dx + 1];
				weighted += source[nx * height + ny] * weight;
				weightTotal += weight;
			}
			target[x * height + y] = weightTotal ? weighted / weightTotal : 0;
		}
		source = target;
	}
	return source;
}

/** Temperature per cell for a future map layer; never passed back to the climate engine. */
export function computeMapCellTemperatures(mapTiles: ArrayLike<number>, unitTemperature: number, scenario?: ScenarioData, iterations = 1): Float32Array {
	if (!Number.isFinite(unitTemperature)) throw new RangeError('unitTemperature must be finite');
	const raw = computeMapCellClimateIndices(mapTiles, scenario);
	const diffused = diffuseClimateIndexField(raw, SM_CITY_MAP_WIDTH, SM_CITY_MAP_HEIGHT, iterations);
	const temperatures = new Float32Array(diffused.length);
	for (let i = 0; i < diffused.length; i += 1) temperatures[i] = computeLocalTemperature(unitTemperature, diffused[i]);
	return temperatures;
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
