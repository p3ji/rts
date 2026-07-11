// FUR & FURY — faction data derived from DESIGN.md (5x5 framework).
// Costs: s = Shinies, z = Zest. Times in seconds, distances in world units.

const A = (f) => encodeURI('/' + f) // portrait URL from exampleassets

export const PORTRAITS = {
  // Republic
  hydro_greaser: A('Gemini_Generated_Image_ (8).png'),
  citrus_slinger: A('Gemini_Generated_Image_ (7).png'),
  melon_mortar: A('Gemini_Generated_Image_ (6).png'),
  spa_guardian: A('Gemini_Generated_Image_ (5).png'),
  guava_goliath: A('Gemini_Generated_Image_ (4).png'),
  grand_bathhouse: A('Gemini_Generated_Image_ (12).png'),
  boiler_totem: A('Gemini_Generated_Image_v87lhwv87lhwv87l (1).png'),
  grease_garage: A('Gemini_Generated_Image_y5xuumy5xuumy5xu.png'),
  percolator: A('Gemini_Generated_Image_z0f1rkz0f1rkz0f1.png'),
  squirt_turret: A('Gemini_Generated_Image_79savr79savr79sa.png'),
  // Trash Pandas
  junkyard_salvager: A('Gemini_Generated_Image_kzj7jbkzj7jbkzj7.png'),
  scavenger: A('Gemini_Generated_Image_ (10).png'),
  cart_glider: A('Gemini_Generated_Image_cmiewbcmiewbcmie.png'),
  garbologist: A('Gemini_Generated_Image_ui352lui352lui35.png'),
  dumpster_titan: A('Gemini_Generated_Image_3bl8eo3bl8eo3bl8.png'),
  the_heap: A('Gemini_Generated_Image_wsucgpwsucgpwsuc.png'),
  raccoon_pile: A('Gemini_Generated_Image_wsucgpwsucgpwsuc (1).png'),
  dumpster_den: A('Gemini_Generated_Image_wsucgpwsucgpwsuc (2).png'),
  compost_codex: A('Gemini_Generated_Image_wsucgpwsucgpwsuc (3).png'),
  bottlecap_ballista: A('Gemini_Generated_Image_wsucgpwsucgpwsuc (4).png'),
  // Celestial Pallas
  astral_levator: A('Gemini_Generated_Image_d9b20yd9b20yd9b2.png'),
  looming_disciple: A('Gemini_Generated_Image_q1bg3dq1bg3dq1bg.png'),
  nebula_stalker: A('Gemini_Generated_Image_dcf51tdcf51tdcf5.png'),
  grand_seer: A('Gemini_Generated_Image_ (9).png'),
  cosmic_floof: A('Gemini_Generated_Image_qaxb53qaxb53qaxb.png'),
  observatory_throne: A('Gemini_Generated_Image_25avhy25avhy25av.png'),
  whisker_pylon: A('Gemini_Generated_Image_96p6pn96p6pn96p6.png'),
  warp_alcove: A('Gemini_Generated_Image_p58ftbp58ftbp58f.png'),
  halo_archive: A('Gemini_Generated_Image_62c14a62c14a62c1.png'),
  scratching_obelisk: A('Gemini_Generated_Image_vlss7avlss7avlss.png'),
}

export const FACTIONS = {
  republic: {
    id: 'republic',
    name: 'Great Rodent Republic',
    blurb: 'Capybara dieselpunk. Durable mechanical units, repairable, defensive. Workers can Repair.',
    color: 0xb98d4f,
    accent: 0xcc7744,
    townHall: 'grand_bathhouse',
    worker: 'hydro_greaser',
    extractorName: 'Juicing Rig',
  },
  panda: {
    id: 'panda',
    name: 'Trash Pandas',
    blurb: 'Raccoon swarm. Cheap, fast, fragile. Garbologist auras whip the swarm into a frenzy.',
    color: 0x8d8496,
    accent: 0xa05ad0,
    townHall: 'the_heap',
    worker: 'junkyard_salvager',
    extractorName: 'Sticky Still',
  },
  pallas: {
    id: 'pallas',
    name: 'Celestial Pallas',
    blurb: 'Cosmic cat monks. Expensive elites with regenerating Floof Shields. Buildings need Pylon power.',
    color: 0x8fb4e8,
    accent: 0xd9b64a,
    townHall: 'observatory_throne',
    worker: 'astral_levator',
    extractorName: 'Zest Chalice',
  },
}

// ---- UNITS ----------------------------------------------------------------
// dmg/atkCd => dps. aggro = auto-acquire radius. shield only for pallas.
export const UNITS = {
  // Republic
  hydro_greaser: {
    faction: 'republic', name: 'Hydro-Greaser', role: 'Worker', tier: 0,
    cost: { s: 50, z: 0, supply: 1 }, buildTime: 10,
    hp: 45, dmg: 4, range: 1.2, atkCd: 1.2, speed: 7.2, aggro: 0, radius: 0.8,
    worker: true, repairs: true, portrait: 'hydro_greaser',
    desc: 'Gathers, builds, and Repairs mechanical units and structures.',
  },
  citrus_slinger: {
    faction: 'republic', name: 'Citrus-Slinger', role: 'T1 Core Fighter', tier: 1,
    cost: { s: 50, z: 25, supply: 1 }, buildTime: 14,
    hp: 85, dmg: 9, range: 8, atkCd: 0.9, speed: 6.6, aggro: 11, radius: 0.9,
    portrait: 'citrus_slinger',
    desc: 'Quad-bike platform lobbing ignited blood oranges. Reliable ranged core.',
  },
  melon_mortar: {
    faction: 'republic', name: 'Melon-Mortar', role: 'T2 Siege Skirmisher', tier: 2,
    cost: { s: 100, z: 75, supply: 2 }, buildTime: 22,
    hp: 150, dmg: 26, range: 13, atkCd: 2.4, speed: 5.2, aggro: 13, radius: 1.1,
    splash: 2.4, portrait: 'melon_mortar',
    desc: 'Tracked mortar firing whole watermelons. Long range, splash damage.',
  },
  spa_guardian: {
    faction: 'republic', name: 'Spa Guardian', role: 'T2.5 Support Caster', tier: 2,
    cost: { s: 100, z: 150, supply: 2 }, buildTime: 24,
    hp: 130, dmg: 0, range: 0, atkCd: 1, speed: 5.8, aggro: 0, radius: 1.1,
    aura: { type: 'heal', radius: 9, rate: 4 }, portrait: 'spa_guardian',
    desc: 'Mobile hot tub. Purifying Soak: heals nearby allies 4 HP/s.',
  },
  guava_goliath: {
    faction: 'republic', name: 'Guava Goliath', role: 'T3 Powerhouse', tier: 3,
    cost: { s: 300, z: 200, supply: 6 }, buildTime: 42,
    hp: 560, dmg: 14, range: 7.5, atkCd: 0.42, speed: 4.6, aggro: 11, radius: 1.7,
    portrait: 'guava_goliath',
    desc: 'Siege mech with twin seed-shredder gatlings and a hot-tub cockpit.',
  },

  // Trash Pandas
  junkyard_salvager: {
    faction: 'panda', name: 'Junkyard Salvager', role: 'Worker', tier: 0,
    cost: { s: 50, z: 0, supply: 1 }, buildTime: 10,
    hp: 40, dmg: 4, range: 1.2, atkCd: 1.2, speed: 7.6, aggro: 0, radius: 0.75,
    worker: true, portrait: 'junkyard_salvager',
    desc: 'Drags a chicken-wire sled. Gathers and grows structures from trash caches.',
  },
  scavenger: {
    faction: 'panda', name: 'Scavenger', role: 'T1 Core Fighter', tier: 1,
    cost: { s: 25, z: 0, supply: 1 }, buildTime: 7,
    hp: 48, dmg: 6, range: 1.4, atkCd: 0.7, speed: 8.2, aggro: 9, radius: 0.7,
    portrait: 'scavenger',
    desc: 'Wet-floor-sign spear, can-mail armor. Dirt cheap, fast, hunts in packs.',
  },
  cart_glider: {
    faction: 'panda', name: 'Shopping Cart Glider', role: 'T2 Skirmisher', tier: 2,
    cost: { s: 75, z: 50, supply: 2 }, buildTime: 16,
    hp: 95, dmg: 13, range: 6.5, atkCd: 1.1, speed: 9.4, aggro: 11, radius: 0.9,
    slow: { amount: 0.75, dur: 2 }, portrait: 'cart_glider',
    desc: 'Reckless cart cavalry. Trash-bag bolas Tangle targets (-25% speed).',
  },
  garbologist: {
    faction: 'panda', name: 'Garbologist', role: 'T2.5 Support Caster', tier: 2,
    cost: { s: 100, z: 125, supply: 2 }, buildTime: 22,
    hp: 110, dmg: 0, range: 0, atkCd: 1, speed: 7.0, aggro: 0, radius: 0.9,
    aura: { type: 'frenzy', radius: 9, speedMul: 1.25, atkMul: 1.25 }, portrait: 'garbologist',
    desc: 'Traffic-cone shaman. Ripening aura: +25% speed and attack rate nearby.',
  },
  dumpster_titan: {
    faction: 'panda', name: 'Dumpster Titan', role: 'T3 Powerhouse', tier: 3,
    cost: { s: 250, z: 175, supply: 5 }, buildTime: 38,
    hp: 520, dmg: 40, range: 2.2, atkCd: 1.1, speed: 6.0, aggro: 10, radius: 1.6,
    splash: 1.8, portrait: 'dumpster_titan',
    desc: 'Garbage-truck power armor. Massive AoE swipes. Ground-shaking melee.',
  },

  // Celestial Pallas
  astral_levator: {
    faction: 'pallas', name: 'Astral Levator', role: 'Worker', tier: 0,
    cost: { s: 50, z: 0, supply: 1 }, buildTime: 11,
    hp: 34, shield: 14, dmg: 4, range: 1.6, atkCd: 1.2, speed: 7.0, aggro: 0, radius: 0.8,
    worker: true, portrait: 'astral_levator',
    desc: 'Levitating sphere of disdain. Warps in structures without touching anything.',
  },
  looming_disciple: {
    faction: 'pallas', name: 'Looming Disciple', role: 'T1 Core Fighter', tier: 1,
    cost: { s: 100, z: 25, supply: 2 }, buildTime: 20,
    hp: 100, shield: 55, dmg: 15, range: 1.6, atkCd: 0.85, speed: 6.2, aggro: 9, radius: 0.9,
    portrait: 'looming_disciple',
    desc: 'Robed monk-cat. Melee that hits like a grand piano. It looms.',
  },
  nebula_stalker: {
    faction: 'pallas', name: 'Nebula Stalker', role: 'T2 Skirmisher', tier: 2,
    cost: { s: 125, z: 75, supply: 2 }, buildTime: 24,
    hp: 90, shield: 75, dmg: 14, range: 8.5, atkCd: 1.2, speed: 7.4, aggro: 12, radius: 1.0,
    portrait: 'nebula_stalker',
    desc: 'Cat fused into a crystalline walker. Ranged, shielded, elegant.',
  },
  grand_seer: {
    faction: 'pallas', name: 'Grand Seer', role: 'T2.5 Support Caster', tier: 2,
    cost: { s: 50, z: 200, supply: 2 }, buildTime: 28,
    hp: 90, shield: 70, dmg: 0, range: 0, atkCd: 1, speed: 5.6, aggro: 0, radius: 0.9,
    aura: { type: 'shieldregen', radius: 9, rate: 6 }, portrait: 'grand_seer',
    desc: 'Haloed oracle. Restores nearby Floof Shields 6/s. Protect at all costs.',
  },
  cosmic_floof: {
    faction: 'pallas', name: 'Cosmic Floof', role: 'T3 Powerhouse', tier: 3,
    cost: { s: 350, z: 275, supply: 8 }, buildTime: 52,
    hp: 320, shield: 320, dmg: 34, range: 9, atkCd: 1.4, speed: 5.0, aggro: 12, radius: 2.0,
    splash: 2.2, portrait: 'cosmic_floof',
    desc: 'Colossal astral projection. Gaze of Judgment: splash beams of contempt.',
  },
}

// ---- BUILDINGS -------------------------------------------------------------
export const BUILDINGS = {
  // Republic
  grand_bathhouse: {
    faction: 'republic', name: 'Grand Bathhouse', kind: 'townhall',
    cost: { s: 400, z: 0 }, buildTime: 60, hp: 1500, radius: 3.4, supply: 10,
    trains: ['hydro_greaser'], portrait: 'grand_bathhouse',
    desc: 'Command spa. Trains workers, receives resources.',
  },
  boiler_totem: {
    faction: 'republic', name: 'Boiler Totem', kind: 'supply',
    cost: { s: 100, z: 0 }, buildTime: 18, hp: 400, radius: 1.5, supply: 8,
    portrait: 'boiler_totem', desc: '+8 supply. Vents comforting steam.',
  },
  grease_garage: {
    faction: 'republic', name: 'Grease Garage', kind: 'production',
    cost: { s: 150, z: 0 }, buildTime: 30, hp: 700, radius: 2.4,
    trains: ['citrus_slinger', 'melon_mortar', 'spa_guardian', 'guava_goliath'],
    portrait: 'grease_garage', desc: 'Builds the Republic war machine.',
  },
  percolator: {
    faction: 'republic', name: 'The Percolator', kind: 'tech',
    cost: { s: 150, z: 100 }, buildTime: 32, hp: 550, radius: 1.9,
    portrait: 'percolator', desc: 'Tech hub. Unlocks Tier 2 and Tier 3 units.',
  },
  squirt_turret: {
    faction: 'republic', name: 'Squirt Turret', kind: 'turret',
    cost: { s: 100, z: 50 }, buildTime: 20, hp: 350, radius: 1.3,
    dmg: 16, range: 9, atkCd: 1.0, portrait: 'squirt_turret',
    desc: 'Automated pressurized-citrus defense.',
  },
  juicing_rig: {
    faction: 'republic', name: 'Juicing Rig', kind: 'extractor',
    cost: { s: 75, z: 0 }, buildTime: 20, hp: 450, radius: 1.6,
    portrait: 'boiler_totem', desc: 'Extracts Zest from a Citrus Geyser.',
  },

  // Trash Pandas
  the_heap: {
    faction: 'panda', name: 'The Heap', kind: 'townhall',
    cost: { s: 350, z: 0 }, buildTime: 55, hp: 1350, radius: 3.2, supply: 10,
    trains: ['junkyard_salvager'], portrait: 'the_heap',
    desc: 'A garbage-truck fortress. Heart of the swarm.',
  },
  raccoon_pile: {
    faction: 'panda', name: 'Raccoon Pile', kind: 'supply',
    cost: { s: 85, z: 0 }, buildTime: 14, hp: 320, radius: 1.4, supply: 8,
    portrait: 'raccoon_pile', desc: '+8 supply. Do not wake them.',
  },
  dumpster_den: {
    faction: 'panda', name: 'Dumpster Den', kind: 'production',
    cost: { s: 120, z: 0 }, buildTime: 24, hp: 600, radius: 2.2,
    trains: ['scavenger', 'cart_glider', 'garbologist', 'dumpster_titan'],
    portrait: 'dumpster_den', desc: 'Spawns the swarm. Cheap and flammable.',
  },
  compost_codex: {
    faction: 'panda', name: 'The Compost Codex', kind: 'tech',
    cost: { s: 130, z: 90 }, buildTime: 28, hp: 480, radius: 1.8,
    portrait: 'compost_codex', desc: 'Rotting knowledge. Unlocks Tier 2 and Tier 3.',
  },
  bottlecap_ballista: {
    faction: 'panda', name: 'Bottle-Cap Ballista', kind: 'turret',
    cost: { s: 90, z: 40 }, buildTime: 16, hp: 300, radius: 1.3,
    dmg: 14, range: 8.5, atkCd: 0.9, portrait: 'bottlecap_ballista',
    desc: 'Spring-loaded cap-disc launcher.',
  },
  sticky_still: {
    faction: 'panda', name: 'Sticky Still', kind: 'extractor',
    cost: { s: 75, z: 0 }, buildTime: 18, hp: 400, radius: 1.6,
    portrait: 'dumpster_den', desc: 'Ferments Zest from a Citrus Geyser.',
  },

  // Celestial Pallas
  observatory_throne: {
    faction: 'pallas', name: 'Observatory Throne', kind: 'townhall',
    cost: { s: 450, z: 0 }, buildTime: 65, hp: 1300, shield: 350, radius: 3.3, supply: 10,
    trains: ['astral_levator'], portrait: 'observatory_throne',
    desc: 'Crystal seat of judgment. Warps in workers.',
  },
  whisker_pylon: {
    faction: 'pallas', name: 'Whisker Pylon', kind: 'supply', power: true,
    cost: { s: 110, z: 0 }, buildTime: 18, hp: 260, shield: 120, radius: 1.3, supply: 8,
    portrait: 'whisker_pylon',
    desc: '+8 supply. Projects the Power Matrix (radius 24). Other structures need it.',
  },
  warp_alcove: {
    faction: 'pallas', name: 'Warp Alcove', kind: 'production', needsPower: true,
    cost: { s: 170, z: 0 }, buildTime: 34, hp: 500, shield: 220, radius: 2.2,
    trains: ['looming_disciple', 'nebula_stalker', 'grand_seer', 'cosmic_floof'],
    portrait: 'warp_alcove', desc: 'Warps in the Celestial host. Needs Pylon power.',
  },
  halo_archive: {
    faction: 'pallas', name: 'Halo Archive', kind: 'tech', needsPower: true,
    cost: { s: 160, z: 110 }, buildTime: 34, hp: 450, shield: 200, radius: 1.9,
    portrait: 'halo_archive', desc: 'Floating library. Unlocks Tier 2 and Tier 3.',
  },
  scratching_obelisk: {
    faction: 'pallas', name: 'Scratching Obelisk', kind: 'turret', needsPower: true,
    cost: { s: 130, z: 30 }, buildTime: 22, hp: 280, shield: 140, radius: 1.3,
    dmg: 18, range: 9.5, atkCd: 1.1, portrait: 'scratching_obelisk',
    desc: 'Crystal beam pillar. Disarmed without Pylon power.',
  },
  zest_chalice: {
    faction: 'pallas', name: 'Zest Chalice', kind: 'extractor',
    cost: { s: 75, z: 0 }, buildTime: 22, hp: 380, shield: 150, radius: 1.6,
    portrait: 'whisker_pylon', desc: 'Refines Zest into starlight. Same API, more smug.',
  },
}

export const EXTRACTOR_OF = {
  republic: 'juicing_rig',
  panda: 'sticky_still',
  pallas: 'zest_chalice',
}

// Build menu per faction (worker build options, excluding town hall for MVP).
export const BUILD_MENU = {
  republic: ['boiler_totem', 'grease_garage', 'percolator', 'squirt_turret', 'juicing_rig'],
  panda: ['raccoon_pile', 'dumpster_den', 'compost_codex', 'bottlecap_ballista', 'sticky_still'],
  pallas: ['whisker_pylon', 'warp_alcove', 'halo_archive', 'scratching_obelisk', 'zest_chalice'],
}

export const POWER_RADIUS = 24
export const SUPPLY_CAP = 100

export function unitProto(id) { return UNITS[id] }
export function buildingProto(id) { return BUILDINGS[id] }
