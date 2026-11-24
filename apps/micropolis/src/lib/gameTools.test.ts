import { describe, expect, it } from 'vitest';
import { GAME_TOOL_GROUPS, resolveDirectBuildingCenterTile, resolveEditingTool, toolFootprintAtCenter } from './gameTools';

describe('toolFootprintAtCenter', () => {
	it('1×1 tools sit on the hovered tile', () => {
		expect(toolFootprintAtCenter(10, 20, 'road')).toEqual({ x: 10, y: 20, w: 1, h: 1 });
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

	it('exposes the engine network/telebase tool as a 1×1 editor tool', () => {
		const module = { EditingTool: { TOOL_NETWORK: 16 } } as never;
		expect(resolveEditingTool(module, 'network')).toBe(16);
		expect(toolFootprintAtCenter(10, 20, 'network')).toEqual({ x: 10, y: 20, w: 1, h: 1 });
		expect(GAME_TOOL_GROUPS.find((group) => group.id === 'special')?.tools.map((tool) => tool.id)).toContain('network');
	});

	it('routes every RCI subgroup to the correct engine tool and 3×3 footprint', () => {
		const module = {
			EditingTool: { TOOL_RESIDENTIAL: 0, TOOL_COMMERCIAL: 1, TOOL_INDUSTRIAL: 2 }
		} as never;
		expect(resolveEditingTool(module, 'res-lv4-building-4')).toBe(0);
		expect(resolveEditingTool(module, 'com-lv3-building-5')).toBe(1);
		expect(resolveEditingTool(module, 'ind-lv2-building-4')).toBe(2);
		expect(toolFootprintAtCenter(10, 20, 'res-lv4-building-4')).toEqual({ x: 9, y: 19, w: 3, h: 3 });
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

	it('exposes every engine land-value band and density subgroup', () => {
		expect(resolveDirectBuildingCenterTile(module, 'res-lv1-building-1')).toBe(265);
		expect(resolveDirectBuildingCenterTile(module, 'res-lv4-building-4')).toBe(400);
		expect(resolveDirectBuildingCenterTile(module, 'com-lv1-building-1')).toBe(436);
		expect(resolveDirectBuildingCenterTile(module, 'com-lv4-building-5')).toBe(607);
		expect(resolveDirectBuildingCenterTile(module, 'ind-lv1-building-1')).toBe(625);
		expect(resolveDirectBuildingCenterTile(module, 'ind-lv2-building-4')).toBe(688);

		expect(GAME_TOOL_GROUPS.find((group) => group.id === 'residential-buildings')?.tools).toHaveLength(17);
		expect(GAME_TOOL_GROUPS.find((group) => group.id === 'commercial-buildings')?.tools).toHaveLength(20);
		expect(GAME_TOOL_GROUPS.find((group) => group.id === 'industrial-buildings')?.tools).toHaveLength(8);
	});
});
