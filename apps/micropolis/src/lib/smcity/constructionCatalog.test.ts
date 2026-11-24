import { describe, expect, it } from 'vitest';
import {
	getAgriculturalClimateRule,
	getConstructionClimateRule,
	resolveConstructionTypeFromTileId,
	smCityConstructionCatalog
} from './constructionCatalog';

describe('SmCity construction catalog', () => {
	it('exposes the complete construction category set', () => {
		expect(smCityConstructionCatalog.categories.map((item) => item.id)).toEqual([
			'R', 'C', 'I', 'A', 'CIV', 'INF', 'LAND'
		]);
	});

	it('assigns progressive market-gardening values by scale, all within -25 to 0', () => {
		const expected = [[-25, -20], [-20, -15], [-15, -10], [-10, -5], [-5, 0]];
		for (let index = 0; index < expected.length; index += 1) {
			for (const [modeIndex, mode] of ['BIO', 'CONV'].entries()) {
				expect(getAgriculturalClimateRule('MAR', `D${index + 1}`, mode)).toEqual({
					kind: 'fixed', value: expected[index][modeIndex]
				});
			}
		}
	});

	it('assigns progressive viticulture values by scale, all within -25 to +25', () => {
		const expected = [[-25, -20], [-15, -10], [-5, 0], [5, 15], [15, 25]];
		for (let index = 0; index < expected.length; index += 1) {
			for (const [modeIndex, mode] of ['BIO', 'CONV'].entries()) {
				expect(getAgriculturalClimateRule('VIT', `D${index + 1}`, mode)).toEqual({
					kind: 'fixed', value: expected[index][modeIndex]
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

	it('maps queried legacy tiles to unambiguous shared construction types', () => {
		expect(resolveConstructionTypeFromTileId(750)).toBe('INF.POWER.COAL');
		expect(resolveConstructionTypeFromTileId(765)).toBe('CIV.FIRE');
		expect(resolveConstructionTypeFromTileId(774)).toBe('CIV.POLICE');
		expect(resolveConstructionTypeFromTileId(816)).toBe('INF.POWER.NUCLEAR');
		expect(resolveConstructionTypeFromTileId(500)).toBeNull();
	});

	it('does not invent climate coefficients for candidate crop specializations', () => {
		expect(getAgriculturalClimateRule('ARB', 'D2', 'BIO')).toEqual({ kind: 'unassigned' });
	});
});
