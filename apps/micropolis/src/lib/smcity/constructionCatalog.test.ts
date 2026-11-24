import { describe, expect, it } from 'vitest';
import {
	getAgriculturalClimateRule,
	getConstructionClimateRule,
	smCityConstructionCatalog
} from './constructionCatalog';

describe('SmCity construction catalog', () => {
	it('exposes the complete construction category set', () => {
		expect(smCityConstructionCatalog.categories.map((item) => item.id)).toEqual([
			'R', 'C', 'I', 'A', 'CIV', 'INF', 'LAND'
		]);
	});

	it('keeps every market-gardening scale and mode within -25 to 0', () => {
		for (const scale of ['D1', 'D2', 'D3', 'D4', 'D5']) {
			for (const mode of ['BIO', 'CONV']) {
				expect(getAgriculturalClimateRule('MAR', scale, mode)).toEqual({
					kind: 'range', min: -25, max: 0
				});
			}
		}
	});

	it('keeps every viticulture scale and mode within -25 to +25', () => {
		for (const scale of ['D1', 'D2', 'D3', 'D4', 'D5']) {
			for (const mode of ['BIO', 'CONV']) {
				expect(getAgriculturalClimateRule('VIT', scale, mode)).toEqual({
					kind: 'range', min: -25, max: 25
				});
			}
		}
	});

	it('retains the established scale-specific cereal and livestock values', () => {
		expect(getAgriculturalClimateRule('CER', 'D3', 'BIO')).toEqual({ kind: 'fixed', value: 50 });
		expect(getAgriculturalClimateRule('ELE', 'D5', 'CONV')).toEqual({ kind: 'fixed', value: 100 });
	});

	it('uses the confirmed revised values for incinerator, river, sea and forest', () => {
		expect(getConstructionClimateRule('CIV.INCINERATOR')).toEqual({ kind: 'fixed', value: 75 });
		expect(getConstructionClimateRule('LAND.FLEUVE')).toEqual({ kind: 'fixed', value: -50 });
		expect(getConstructionClimateRule('LAND.SEA')).toEqual({ kind: 'fixed', value: -75 });
		expect(getConstructionClimateRule('LAND.FOREST')).toEqual({ kind: 'fixed', value: -75 });
	});

	it('does not invent climate coefficients for candidate crop specializations', () => {
		expect(getAgriculturalClimateRule('ARB', 'D2', 'BIO')).toEqual({ kind: 'unassigned' });
	});
});
