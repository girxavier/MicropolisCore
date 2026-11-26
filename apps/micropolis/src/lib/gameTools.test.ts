import { describe, expect, it } from 'vitest';
import { resolveDirectBuildingCenterTile, toolFootprintAtCenter } from './gameTools';

describe('toolFootprintAtCenter', () => {
	it('1×1 tools sit on the hovered tile', () => {
		expect(toolFootprintAtCenter(10, 20, 'road')).toEqual({ x: 10, y: 20, w: 1, h: 1 });
	});

	it('the generic terrain brush edits one map cell', () => {
		expect(toolFootprintAtCenter(10, 20, 'terrain-paint')).toEqual({ x: 10, y: 20, w: 1, h: 1 });
	});

	it('3×3 zones anchor top-left at center − (1, 1)', () => {
		expect(toolFootprintAtCenter(10, 20, 'res')).toEqual({ x: 9, y: 19, w: 3, h: 3 });
	});

	it('4×4 buildings anchor top-left at center − (1, 1)', () => {
		expect(toolFootprintAtCenter(10, 20, 'seaport')).toEqual({ x: 9, y: 19, w: 4, h: 4 });
	});

	it('6×6 airport anchors top-left at center − (1, 1)', () => {
		expect(toolFootprintAtCenter(10, 20, 'airport')).toEqual({ x: 9, y: 19, w: 6, h: 6 });
	});
});

describe('direct building variants', () => {
	const module = {
		Tiles: {
			RZB: { value: 265 },
			FREEZ: { value: 244 },
			CZB: { value: 436 },
			IND1: { value: 621 }
		}
	} as never;

	it('places a free residential lot for individual houses', () => {
		expect(resolveDirectBuildingCenterTile(module, 'res-houses')).toBe(244);
	});

	it('uses engine residential and commercial density bands', () => {
		expect(resolveDirectBuildingCenterTile(module, 'res-building-1')).toBe(337);
		expect(resolveDirectBuildingCenterTile(module, 'res-building-4')).toBe(364);
		expect(resolveDirectBuildingCenterTile(module, 'com-building-1')).toBe(526);
		expect(resolveDirectBuildingCenterTile(module, 'com-building-5')).toBe(562);
	});

	it('accounts for the industrial tile family centre offset', () => {
		expect(resolveDirectBuildingCenterTile(module, 'ind-building-1')).toBe(661);
		expect(resolveDirectBuildingCenterTile(module, 'ind-building-4')).toBe(688);
	});
});
