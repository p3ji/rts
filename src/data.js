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

export const PLAYER_COLORS = [0x3e7fe8, 0xe0483a, 0x43b85c, 0xb050d8]
export const PLAYER_NAMES = ['Blue Kingdom', 'Red Kingdom', 'Green Kingdom', 'Purple Kingdom']

export const UNITS = {
  villager: {
    name: 'Villager', role: 'Worker', age: 1,
    cost: { w: 0, g: 25, supply: 1 }, buildTime: 14,
    hp: 45, dmg: 4, range: 0.6, atkCd: 1.3, speed: 7, radius: 0.55, aggro: 0,
    worker: true, repairs: true,
    desc: 'Chops wood, mines gold, builds and repairs. The backbone of the kingdom.',
  },
  swordsman: {
    name: 'Swordsman', role: 'Melee infantry', age: 1,
    cost: { w: 25, g: 35, supply: 2 }, buildTime: 18,
    hp: 110, dmg: 11, range: 0.6, atkCd: 1.0, speed: 7.5, radius: 0.6, aggro: 9,
    desc: 'Sturdy front-line fighter with sword and shield.',
  },
  archer: {
    name: 'Archer', role: 'Ranged', age: 1,
    cost: { w: 45, g: 25, supply: 2 }, buildTime: 18,
    hp: 60, dmg: 9, range: 13, atkCd: 1.2, speed: 7.5, radius: 0.55, aggro: 12,
    desc: 'Cheap ranged damage. Fragile — keep behind the swordsmen.',
  },
  knight: {
    name: 'Knight', role: 'Heavy cavalry', age: 2,
    cost: { w: 30, g: 95, supply: 3 }, buildTime: 26,
    hp: 240, dmg: 18, range: 0.7, atkCd: 1.1, speed: 9.5, radius: 0.75, aggro: 10,
    desc: 'Fast, armored shock trooper. Crashes through archer lines.',
  },
  priest: {
    name: 'Priest', role: 'Support healer', age: 2,
    cost: { w: 0, g: 85, supply: 2 }, buildTime: 24,
    hp: 70, dmg: 0, range: 0, atkCd: 1, speed: 7, radius: 0.55, aggro: 0,
    aura: { type: 'heal', radius: 9, rate: 5 },
    desc: 'Heals nearby friendly units. Wobbles serenely.',
  },
  catapult: {
    name: 'Catapult', role: 'Siege', age: 2,
    cost: { w: 140, g: 70, supply: 4 }, buildTime: 38,
    hp: 130, dmg: 34, range: 17, atkCd: 3.4, splash: 3.5, speed: 4.8, radius: 1.0, aggro: 15,
    desc: 'Lobs boulders with splash damage. Devastating vs buildings, helpless up close.',
  },
}

export const BUILDINGS = {
  towncenter: {
    name: 'Town Center', kind: 'townhall', age: 1,
    cost: { w: 275, g: 125 }, buildTime: 55,
    hp: 1800, radius: 5, supply: 12, dropoff: true,
    trains: ['villager'],
    desc: 'Heart of the kingdom. Trains villagers, accepts resources, and researches the next Age.',
  },
  farm: {
    name: 'Farm', kind: 'supply', age: 1,
    cost: { w: 45 }, buildTime: 14,
    hp: 250, radius: 2.6, supply: 16,
    desc: '+16 supply. Golden wheat, tended by nobody in particular.',
  },
  barracks: {
    name: 'Barracks', kind: 'production', age: 1,
    cost: { w: 120 }, buildTime: 26,
    hp: 900, radius: 3.6,
    trains: ['swordsman', 'knight'],
    desc: 'Trains Swordsmen — and Knights once you reach Age II.',
  },
  archery: {
    name: 'Archery Range', kind: 'production', age: 1,
    cost: { w: 130 }, buildTime: 26,
    hp: 800, radius: 3.6,
    trains: ['archer', 'catapult'],
    desc: 'Trains Archers — and Catapults once you reach Age II.',
  },
  storage: {
    name: 'Storehouse', kind: 'dropoff', age: 1,
    cost: { w: 75 }, buildTime: 16,
    hp: 500, radius: 2.6, dropoff: true,
    desc: 'Resource drop-off point. Build near forests and gold to shorten trips.',
  },
  watchtower: {
    name: 'Watchtower', kind: 'turret', age: 1,
    cost: { w: 90, g: 35 }, buildTime: 24,
    hp: 550, radius: 1.9, dmg: 13, range: 15, atkCd: 1.4,
    desc: 'Fires arrows at enemies in range. Anchors your defense.',
  },
  temple: {
    name: 'Temple', kind: 'tech', age: 1,
    cost: { w: 90, g: 70 }, buildTime: 30,
    hp: 700, radius: 3.2,
    trains: ['priest'],
    desc: 'Required to advance to Age II. Trains Priests in Age II.',
  },
}

// Build menu shown to villagers (order matters)
export const BUILD_MENU = ['farm', 'storage', 'barracks', 'archery', 'watchtower', 'temple', 'towncenter']

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
  infinite: { name: 'Infinite', mul: Infinity },
}

// AI difficulty presets
// workers/armyCap scaled up alongside SUPPLY_CAP (was tuned for the old 80 cap —
// left as-is, the AI would cap out around 50 supply and never use the new
// headroom, making higher difficulties trivial against a big player army).
export const DIFFICULTY = {
  easy: {
    name: 'Easy', workers: 25, armyCap: 25,
    waveFirst: 330, waveEvery: 150, waveStart: 6, waveGrow: 3,
    incomeMul: 0.8, ageAt: 420,
  },
  normal: {
    name: 'Normal', workers: 35, armyCap: 45,
    waveFirst: 250, waveEvery: 115, waveStart: 8, waveGrow: 5,
    incomeMul: 1.0, ageAt: 330,
  },
  hard: {
    name: 'Hard', workers: 45, armyCap: 65,
    waveFirst: 190, waveEvery: 90, waveStart: 10, waveGrow: 7,
    incomeMul: 1.3, ageAt: 260,
  },
}

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
}

// Building footprint (world units across) each model is scaled to
export const MODEL_FOOTPRINT = {
  towncenter: 10.5, farm: 5.4, barracks: 7.6, archery: 7.6,
  storage: 5.4, watchtower: 3.6, temple: 6.8,
}
