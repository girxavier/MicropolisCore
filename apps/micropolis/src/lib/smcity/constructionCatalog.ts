import rawCatalog from '../../../../../content/micropolis/smcity/construction-types.json';

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
export function getConstructionClimateRule(constructionId: string): ClimateIndexRule {
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
	productionMode: string
): ClimateIndexRule {
	const agriculture = smCityConstructionCatalog.categories.find((item) => item.id === 'A');
	const specialization = agriculture?.specializations?.find((item) => item.id === specializationId);
	if (!specialization) return { kind: 'unassigned' };

	if (specialization.climateIndexRange) {
		const [min, max] = specialization.climateIndexRange;
		return { kind: 'range', min, max };
	}

	const byScale = specialization.climateIndexByScale?.[scaleId];
	if (byScale) return fixedOrUnassigned(byScale[productionMode]);

	return fixedOrUnassigned(specialization.climateIndex);
}
