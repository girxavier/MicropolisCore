import type { EditingTool, MainModule } from '../types/micropolisengine.d.js';

export type ToolId =
	| 'query'
	| 'bulldoze'
	| 'clear'
	| 'wire'
	| 'road'
	| 'rail'
	| 'park'
	| 'res'
	| 'com'
	| 'ind'
	| 'police'
	| 'fire'
	| 'seaport'
	| 'coal'
	| 'stadium'
	| 'nuclear'
	| 'airport'
	| 'water'
	| 'land'
	| 'forest'
	| 'terrain-paint'
	| 'res-houses' | 'res-building-1' | 'res-building-2' | 'res-building-3' | 'res-building-4'
	| 'com-building-1' | 'com-building-2' | 'com-building-3' | 'com-building-4' | 'com-building-5'
	| 'ind-building-1' | 'ind-building-2' | 'ind-building-3' | 'ind-building-4';


export type TerrainBrushId = 'land' | 'water' | 'forest';

export const TERRAIN_BRUSHES: ReadonlyArray<{ id: TerrainBrushId; label: string; tileId: number }> = [
	{ id: 'land', label: 'Terre nue', tileId: 0 },
	{ id: 'water', label: 'Eau douce', tileId: 2 },
	{ id: 'forest', label: 'Forêt', tileId: 37 },
];

export interface ToolDef {
	id: ToolId;
	/** Title-case name shown in the palette (after the shortcut). */
	label: string;
	shortcut: string;
	/** Engine cost per placement (from `gCostOf[]` in tool.cpp). */
	cost: number;
}

export interface ToolGroup {
	id: string;
	/** Optional muted group heading in the palette. */
	label?: string;
	tools: ToolDef[];
}

/** Cheapest → most expensive; similar tools grouped. */
export const GAME_TOOL_GROUPS: ToolGroup[] = [
	{
		id: 'inspect',
		tools: [{ id: 'query', label: 'Query', shortcut: 'Q', cost: 0 }],
	},
	{
		id: 'clear',
		tools: [
			{ id: 'clear', label: 'CLEAR · Terre nue', shortcut: 'X', cost: 0 },
			{ id: 'bulldoze', label: 'Bulldozer', shortcut: 'B', cost: 1 }
		],
	},
	{
		id: 'transport',
		label: 'Transport',
		tools: [
			{ id: 'wire', label: 'Wire', shortcut: 'W', cost: 5 },
			{ id: 'road', label: 'Road', shortcut: 'R', cost: 10 },
			{ id: 'rail', label: 'Rail', shortcut: 'L', cost: 20 },
		],
	},
	{
		id: 'zones',
		label: 'Zones',
		tools: [
			{ id: 'res', label: 'Residential', shortcut: 'U', cost: 100 },
			{ id: 'com', label: 'Commercial', shortcut: 'E', cost: 100 },
			{ id: 'ind', label: 'Industrial', shortcut: 'T', cost: 100 },
		],
	},
	{
		id: 'civic',
		label: 'Civic',
		tools: [
			{ id: 'park', label: 'Park', shortcut: 'P', cost: 10 },
			{ id: 'police', label: 'Police', shortcut: 'K', cost: 500 },
			{ id: 'fire', label: 'Fire', shortcut: 'F', cost: 500 },
		],
	},
	{
		id: 'major',
		label: 'Major',
		tools: [
			{ id: 'seaport', label: 'Seaport', shortcut: 'H', cost: 3000 },
			{ id: 'coal', label: 'Coal Power', shortcut: 'Y', cost: 3000 },
			{ id: 'stadium', label: 'Stadium', shortcut: 'S', cost: 5000 },
			{ id: 'nuclear', label: 'Nuclear', shortcut: 'N', cost: 5000 },
			{ id: 'airport', label: 'Airport', shortcut: 'A', cost: 10000 },
		],
	},
	{
		id: 'residential-buildings',
		label: 'Bâtiments résidentiels',
		tools: [
			{ id: 'res-houses', label: 'Maisons individuelles', shortcut: '—', cost: 0 },
			{ id: 'res-building-1', label: 'Faible densité', shortcut: '—', cost: 0 },
			{ id: 'res-building-2', label: 'Densité moyenne-faible', shortcut: '—', cost: 0 },
			{ id: 'res-building-3', label: 'Densité moyenne-forte', shortcut: '—', cost: 0 },
			{ id: 'res-building-4', label: 'Forte densité', shortcut: '—', cost: 0 },
		],
	},
	{
		id: 'commercial-buildings',
		label: 'Bâtiments commerciaux',
		tools: [
			{ id: 'com-building-1', label: 'Commerce · densité 1', shortcut: '—', cost: 0 },
			{ id: 'com-building-2', label: 'Commerce · densité 2', shortcut: '—', cost: 0 },
			{ id: 'com-building-3', label: 'Commerce · densité 3', shortcut: '—', cost: 0 },
			{ id: 'com-building-4', label: 'Commerce · densité 4', shortcut: '—', cost: 0 },
			{ id: 'com-building-5', label: 'Commerce · densité 5', shortcut: '—', cost: 0 },
		],
	},
	{
		id: 'industrial-buildings',
		label: 'Bâtiments industriels',
		tools: [
			{ id: 'ind-building-1', label: 'Industrie · densité 1', shortcut: '—', cost: 0 },
			{ id: 'ind-building-2', label: 'Industrie · densité 2', shortcut: '—', cost: 0 },
			{ id: 'ind-building-3', label: 'Industrie · densité 3', shortcut: '—', cost: 0 },
			{ id: 'ind-building-4', label: 'Industrie · densité 4', shortcut: '—', cost: 0 },
		],
	},
	{
		id: 'terrain',
		label: 'Terrain',
		tools: [
			{ id: 'terrain-paint', label: 'Pinceau terrain', shortcut: '—', cost: 0 },
			{ id: 'water', label: 'Eau douce (rivière / lac)', shortcut: 'M', cost: 0 },
			{ id: 'forest', label: 'Forêt', shortcut: 'V', cost: 0 },
			{ id: 'land', label: 'Dégager le terrain', shortcut: 'G', cost: 0 },
		],
	},
];

export const GAME_TOOLS: ToolDef[] = GAME_TOOL_GROUPS.flatMap((g) => g.tools);

export const TOOL_BY_SHORTCUT: Record<string, ToolId> = Object.fromEntries(
	GAME_TOOLS.filter((t) => t.shortcut !== '—').map((t) => [t.shortcut.toLowerCase(), t.id]),
);

export function toolMenuLabel(tool: ToolDef): string {
	return `${tool.label} ($${tool.cost})`;
}

export function resolveEditingTool(module: MainModule, id: ToolId): EditingTool {
	const t = module.EditingTool;
	switch (id) {
		case 'query':
			return t.TOOL_QUERY;
		case 'bulldoze':
		case 'clear':
			return t.TOOL_BULLDOZER;
		case 'wire':
			return t.TOOL_WIRE;
		case 'road':
			return t.TOOL_ROAD;
		case 'rail':
			return t.TOOL_RAILROAD;
		case 'park':
			return t.TOOL_PARK;
		case 'res':
			return t.TOOL_RESIDENTIAL;
		case 'com':
			return t.TOOL_COMMERCIAL;
		case 'ind':
			return t.TOOL_INDUSTRIAL;
		case 'police':
			return t.TOOL_POLICESTATION;
		case 'fire':
			return t.TOOL_FIRESTATION;
		case 'seaport':
			return t.TOOL_SEAPORT;
		case 'coal':
			return t.TOOL_COALPOWER;
		case 'stadium':
			return t.TOOL_STADIUM;
		case 'nuclear':
			return t.TOOL_NUCLEARPOWER;
		case 'airport':
			return t.TOOL_AIRPORT;
		case 'terrain-paint':
			// The editor handles this generic brush directly; this is a safe fallback.
			return t.TOOL_LAND;
		case 'water':
			return t.TOOL_WATER;
		case 'land':
			return t.TOOL_LAND;
		case 'forest':
			return t.TOOL_FOREST;
		case 'res-houses': case 'res-building-1': case 'res-building-2': case 'res-building-3': case 'res-building-4':
			return t.TOOL_RESIDENTIAL;
		case 'com-building-1': case 'com-building-2': case 'com-building-3': case 'com-building-4': case 'com-building-5':
			return t.TOOL_COMMERCIAL;
		case 'ind-building-1': case 'ind-building-2': case 'ind-building-3': case 'ind-building-4':
			return t.TOOL_INDUSTRIAL;
		default:
			return t.TOOL_ROAD;
	}
}

/** Tile footprint per tool — mirrors `gToolSize[]` in micropolis-engine `tool.cpp`. */
const TOOL_FOOTPRINT_SIZE: Record<ToolId, number> = {
	query: 1,
	clear: 1,
	bulldoze: 1,
	wire: 1,
	road: 1,
	rail: 1,
	park: 1,
	res: 3,
	com: 3,
	ind: 3,
	police: 3,
	fire: 3,
	seaport: 4,
	coal: 4,
	stadium: 4,
	nuclear: 4,
	airport: 6,
	water: 1,
	land: 1,
	forest: 1,
	'terrain-paint': 1,
	'res-houses': 3,
	'res-building-1': 3, 'res-building-2': 3, 'res-building-3': 3, 'res-building-4': 3,
	'com-building-1': 3, 'com-building-2': 3, 'com-building-3': 3, 'com-building-4': 3, 'com-building-5': 3,
	'ind-building-1': 3, 'ind-building-2': 3, 'ind-building-3': 3, 'ind-building-4': 3,
};


/** Return the centre tile ID for an engine-native developed 3×3 zone variant. */
export function resolveDirectBuildingCenterTile(module: MainModule, id: ToolId): number | null {
	const tiles = module.Tiles;
	const suffix = Number(id.slice(-1));
	if (id === 'res-houses') return tiles.FREEZ.value;
	if (id.startsWith('res-building-') && suffix >= 1 && suffix <= 4) {
		// The engine's residential plop uses 4 land-value bands × 4 density levels.
		return tiles.RZB.value + ((2 * 4 + (suffix - 1)) * 9);
	}
	if (id.startsWith('com-building-') && suffix >= 1 && suffix <= 5) {
		// Commercial variants use 4 land-value bands × 5 density levels.
		return tiles.CZB.value + ((2 * 5 + (suffix - 1)) * 9);
	}
	if (id.startsWith('ind-building-') && suffix >= 1 && suffix <= 4) {
		// Industrial variants use 2 land-value bands × 4 density levels.
		return tiles.IND1.value + ((1 * 4 + (suffix - 1)) * 9) + 4;
	}
	return null;
}

export interface ToolFootprint {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Screen footprint for the active tool at the hovered tile.
 * Multi-tile buildings use engine `buildBuilding` anchor: top-left = center − (1, 1).
 */
export function toolFootprintAtCenter(centerX: number, centerY: number, id: ToolId): ToolFootprint {
	const size = TOOL_FOOTPRINT_SIZE[id];
	if (size <= 1) {
		return { x: centerX, y: centerY, w: 1, h: 1 };
	}
	return {
		x: centerX - 1,
		y: centerY - 1,
		w: size,
		h: size,
	};
}

export function toolCursor(id: ToolId, panning: boolean, shiftPanHeld = false): string {
	if (panning) return 'grabbing';
	if (shiftPanHeld) return 'grab';
	switch (id) {
		case 'query':
			return 'crosshair';
		case 'bulldoze':
		case 'clear':
		case 'terrain-paint':
			return 'cell';
		default:
			return 'default';
	}
}
