import rawCatalog from '../../../../../content/micropolis/smcity/construction-types.json';
import type { ScenarioData } from './scenarioData';

type CatalogType = {
	id: string;
	climateIndex?: number | null;
};

type AgricultureSpecialization = {
	id: string;
	climateIndex?: number | null;
	climateIndexRange?: [number, number];
	climateIndexByScale?: Record<string, Record<string, number>>;
};

type CatalogCategory = {
	id: string;
	types?: CatalogType[];
	specializations?: AgricultureSpecialization[];
};

type ConstructionCatalog = {
	categories: CatalogCategory[];
};

export const smCityConstructionCatalog = rawCatalog as ConstructionCatalog;

/** Best-effort mapping for legacy Micropolis tile IDs that have an unambiguous SmCity type. */
export function resolveConstructionTypeFromTileId(rawTileId: number): string | null {
	const tileId = rawTileId & 0x03ff;
	if (tileId >= 265 && tileId <= 404) {
		const densityBand = Math.floor((tileId - 265) / 9) % 4;
		return densityBand <= 1 ? 'R.D1' : densityBand === 2 ? 'R.D2' : 'R.D3';
	}
	if (tileId >= 745 && tileId <= 760) return 'INF.POWER.COAL';
	if (tileId >= 761 && tileId <= 769) return 'CIV.FIRE';
	if (tileId >= 770 && tileId <= 778) return 'CIV.POLICE';
	if (tileId >= 779 && tileId <= 794) return 'CIV.STADIUM';
	if (tileId >= 811 && tileId <= 826) return 'INF.POWER.NUCLEAR';
	if (tileId >= 1 && tileId <= 20) return 'LAND.RIVER';
	if (tileId >= 21 && tileId <= 43) return 'LAND.TREE';
	return null;
}

export type ClimateIndexRule =
	| { kind: 'fixed'; value: number }
	| { kind: 'range'; min: number; max: number }
	| { kind: 'unassigned' };

function fixedOrUnassigned(value: number | null | undefined): ClimateIndexRule {
	return typeof value === 'number'
		? { kind: 'fixed', value }
		: { kind: 'unassigned' };
}

/** Return the climate rule for a non-agricultural construction ID. */
export function getConstructionClimateRule(constructionId: string, scenario?: ScenarioData): ClimateIndexRule {
	const scenarioValue = scenario?.constructionTypes[constructionId]?.climateIndex;
	if (typeof scenarioValue === 'number') return fixedOrUnassigned(scenarioValue);
	const agriculturalMatch = /^A\.([A-Z]+)\.(D[1-5])\.(BIO|CONV)$/.exec(constructionId);
	if (agriculturalMatch) {
		return getAgriculturalClimateRule(agriculturalMatch[1], agriculturalMatch[2], agriculturalMatch[3], scenario);
	}
	for (const category of smCityConstructionCatalog.categories) {
		const construction = category.types?.find((item) => item.id === constructionId);
		if (construction) return fixedOrUnassigned(construction.climateIndex);
	}
	return { kind: 'unassigned' };
}

/** Resolve an agricultural specialization / scale / production-mode combination. */
export function getAgriculturalClimateRule(
	specializationId: string,
	scaleId: string,
	productionMode: string,
	scenario?: ScenarioData
): ClimateIndexRule {
	const agriculture = smCityConstructionCatalog.categories.find((item) => item.id === 'A');
	const specialization = agriculture?.specializations?.find((item) => item.id === specializationId);
	if (!specialization) return { kind: 'unassigned' };

	const scenarioValue = scenario?.constructionTypes[`A.${specializationId}.${scaleId}.${productionMode}`]?.climateIndex;
	if (typeof scenarioValue === 'number') return fixedOrUnassigned(scenarioValue);

	if (specialization.climateIndexRange) {
		const [min, max] = specialization.climateIndexRange;
		return { kind: 'range', min, max };
	}

	const byScale = specialization.climateIndexByScale?.[scaleId];
	if (byScale) return fixedOrUnassigned(byScale[productionMode]);

	return fixedOrUnassigned(specialization.climateIndex);
}
