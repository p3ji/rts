// Kingdoms of Wobbleton — data definitions.
// One medieval civilization, two Ages, classic wood + gold economy.
// Costs: { w: wood, g: gold, supply }

// 200 supply benchmarked at ~83 units/player (4-player FFA, ~330 units total):
// sim tick cost stays ~18-20% of the 33ms frame budget, comfortably safe even
// stacked with rendering. Headroom holds up to ~100/player before it's worth
// revisiting (separation() is the O(units^2) cost driver at real scale).
export const SUPPLY_CAP = 200
export const AGE_UP_COST = { w: 250, g: 175 }
export const AGE_UP_TIME = 45

import unitsData from './units.json'
import buildingsData from './buildings.json'
import difficultyData from './difficulty.json'

export const PLAYER_COLORS = [0x3e7fe8, 0xe0483a, 0x43b85c, 0xb050d8]
export const PLAYER_NAMES = ['Blue Kingdom', 'Red Kingdom', 'Green Kingdom', 'Purple Kingdom']

export const UNITS = unitsData
export const BUILDINGS = buildingsData


// Build menu shown to villagers (order matters)
export const BUILD_MENU = ['wall', 'farm', 'storage', 'barracks', 'archery', 'watchtower', 'temple', 'towncenter']

// Neutral map features — not owned by anyone at game start.
export const NEUTRAL_TOWER = {
  name: 'Watchtower', radius: 3.2,
  hp: 700, captureRadius: 11, captureTime: 12, goldPerSec: 1.4,
  desc: 'Neutral. Hold ground nearby uncontested for a while to capture it — a captured tower generates gold for its owner until someone else takes it.',
}
export const TREASURE = {
  name: 'Treasure Chest', radius: 1.1, pickupRadius: 1.7, goldMin: 90, goldMax: 190,
  desc: 'A one-time gold reward for whichever unit reaches it first.',
}

// Pre-match map generation options (home screen "Map Settings")
export const RESOURCE_ABUNDANCE = {
  low: { name: 'Scarce', mul: 0.6 },
  normal: { name: 'Normal', mul: 1 },
  high: { name: 'Abundant', mul: 1.8 },
  infinite: { name: 'Infinite', mul: 999999 },
}

// AI difficulty presets
// workers/armyCap scaled up alongside SUPPLY_CAP (was tuned for the old 80 cap —
// left as-is, the AI would cap out around 50 supply and never use the new
// headroom, making higher difficulties trivial against a big player army).
export const DIFFICULTY = difficultyData

// glTF model manifest: /models/<file>.gltf
// Buildings: [ageI, ageII]
export const MODELS = {
  buildings: {
    towncenter: ['TownCenter_FirstAge_Level2', 'TownCenter_SecondAge_Level2'],
    farm: ['Farm_FirstAge_Level2_Wheat', 'Farm_SecondAge_Level2_Wheat'],
    barracks: ['Barracks_FirstAge_Level2', 'Barracks_SecondAge_Level2'],
    archery: ['Archery_FirstAge_Level2', 'Archery_SecondAge_Level2'],
    storage: ['Storage_FirstAge_Level2', 'Storage_SecondAge_Level2'],
    watchtower: ['WatchTower_FirstAge_Level2', 'WatchTower_SecondAge_Level2'],
    temple: ['Temple_FirstAge_Level2', 'Temple_SecondAge_Level2'],
    wall: ['Wall_FirstAge_Level2', 'Wall_SecondAge_Level2'],
  },
  resources: {
    tree: ['Resource_Tree_Group', 'Resource_Tree_Group_Cut'],
    pine: ['Resource_PineTree_Group', 'Resource_PineTree_Group_Cut'],
    gold: ['Resource_Gold_1', 'Resource_Gold_2', 'Resource_Gold_3'],
  },
  scenery: {
    mountain: ['Mountain_Single', 'MountainLarge_Single', 'Mountain_Group_1', 'Mountain_Group_2'],
    rock: ['Resource_Rock_1', 'Resource_Rock_2', 'Resource_Rock_3'],
    prop: ['Barrel', 'Crate_Stack1', 'Logs'],
    windmill: ['Windmill_FirstAge'],
  },
  treasure: ['Crate_Stack1'],
  units: {
    golem: 'golem.glb',
  },
}

// Building footprint (world units across) each model is scaled to
export const MODEL_FOOTPRINT = {
  towncenter: 10.5, farm: 5.4, barracks: 7.6, archery: 7.6,
  storage: 5.4, watchtower: 3.6, temple: 6.8, wall: 2.0,
}
