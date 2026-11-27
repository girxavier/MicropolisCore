import rawCatalog from '../../../../../content/micropolis/smcity/construction-types.json';
import rawClimateCoefficients from '../../../../../content/micropolis/smcity/climate-coefficients.json';
import type { ScenarioData } from './scenarioData';

type CatalogType = {
	id: string;
	label?: string;
};

type AgricultureSpecialization = {
	id: string;
	label?: string;
};

type CatalogCategory = {
	id: string;
	types?: CatalogType[];
	specializations?: AgricultureSpecialization[];
	scales?: Array<{ id: string; label?: string }>;
};

type ConstructionCatalog = {
	categories: CatalogCategory[];
};

export const smCityConstructionCatalog = rawCatalog as ConstructionCatalog;

const climateCoefficients = rawClimateCoefficients as { types: Record<string, number | null>; agriculture: Record<string, Record<string, Record<string, number>>> };

/** Best-effort mapping for legacy Micropolis tile IDs that have an unambiguous SmCity type. */
export function resolveConstructionTypeFromTileId(rawTileId: number): string | null {
	const tileId = rawTileId & 0x03ff;
	if (tileId === 0) return 'LAND.BARE';
	if (tileId === 4) return 'LAND.CANAL';
	if (tileId >= 2 && tileId <= 20) return 'LAND.FLEUVE';
	if (tileId >= 21 && tileId <= 36) return 'LAND.TREE';
	if (tileId >= 37 && tileId <= 43) return 'LAND.FOREST';
	if (tileId >= 44 && tileId <= 47) return 'LAND.RUBBLE';
	if (tileId >= 48 && tileId <= 51) return 'LAND.FLOOD';
	if (tileId === 52) return 'LAND.RADIOACTIVE';
	if (tileId >= 56 && tileId <= 63) return 'LAND.FIRE';
	if ((tileId >= 64 && tileId <= 207) || tileId === 239 || (tileId >= 827 && tileId <= 831) || (tileId >= 948 && tileId <= 951)) return 'INF.TRANSPORT.ROAD';
	if (tileId >= 208 && tileId <= 222) return 'INF.GRID.ELECTRIC';
	if (tileId >= 224 && tileId <= 238) return 'INF.TRANSPORT.RAIL';
	if (tileId >= 240 && tileId <= 404) {
		const densityBand = Math.floor((tileId - 265) / 9) % 4;
		return densityBand <= 1 ? 'R.D1' : densityBand === 2 ? 'R.D2' : 'R.D3';
	}
	if (tileId >= 405 && tileId <= 413) return 'CIV.HOSPITAL';
	if ((tileId >= 414 && tileId <= 422) || (tileId >= 956 && tileId <= 1018)) return 'CIV.CHURCH';
	if (tileId >= 423 && tileId <= 609) {
		if (tileId < 436) return 'C.PROX';
		const density = Math.floor((tileId - 436) / 9) % 5 + 1;
		return density <= 1 ? 'C.PROX' : density === 2 ? 'C.SERVICE' : density === 3 ? 'C.RETAIL' : 'C.LOG';
	}
	if (tileId >= 612 && tileId <= 692) {
		if (tileId < 625) return 'I.LIGHT';
		const density = Math.floor((tileId - 625) / 9) % 4 + 1;
		return density === 1 ? 'I.LIGHT' : density === 2 ? 'I.TECH' : density === 3 ? 'I.HEAVY' : 'I.DATA';
	}
	if (tileId >= 693 && tileId <= 708) return 'INF.TRANSPORT.SEAPORT';
	if ((tileId >= 709 && tileId <= 744) || (tileId >= 832 && tileId <= 839)) return 'INF.TRANSPORT.AIRPORT';
	if (tileId >= 745 && tileId <= 760) return 'INF.POWER.COAL';
	if (tileId >= 761 && tileId <= 769) return 'CIV.FIRE';
	if (tileId >= 770 && tileId <= 778) return 'CIV.POLICE';
	if ((tileId >= 779 && tileId <= 810) || (tileId >= 932 && tileId <= 947)) return 'CIV.STADIUM';
	if ((tileId >= 811 && tileId <= 826) || (tileId >= 952 && tileId <= 955)) return 'INF.POWER.NUCLEAR';
	if (tileId === 840) return 'LAND.PARK';
	if (tileId >= 844 && tileId <= 851) return 'INF.TELECOM';
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
	if (agriculturalMatch) return getAgriculturalClimateRule(agriculturalMatch[1], agriculturalMatch[2], agriculturalMatch[3], scenario);
	return fixedOrUnassigned(climateCoefficients.types[constructionId]);
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
	return fixedOrUnassigned(climateCoefficients.agriculture[specializationId]?.[scaleId]?.[productionMode]);
}

/** Human-readable label for a catalogued building or agricultural parcel. */
export function getConstructionTypeLabel(constructionId: string): string {
	const agricultureMatch = /^A\.([A-Z]+)\.(D[1-5])\.(BIO|CONV)$/.exec(constructionId);
	if (agricultureMatch) {
		const agriculture = smCityConstructionCatalog.categories.find((item) => item.id === 'A');
		const specialization = agriculture?.specializations?.find((item) => item.id === agricultureMatch[1]);
		const scale = agriculture?.scales?.find((item) => item.id === agricultureMatch[2]);
		return [specialization?.label ?? agricultureMatch[1], scale?.label ?? agricultureMatch[2], agricultureMatch[3]].join(' · ');
	}
	for (const category of smCityConstructionCatalog.categories) {
		const type = category.types?.find((item) => item.id === constructionId);
		if (type) return `${category.label} · ${type.label ?? constructionId}`;
	}
	return constructionId;
}
