import { UNITS, BUILDINGS, SUPPLY_CAP, PLAYER_COLORS, PLAYER_NAMES, DIFFICULTY } from './data.js'

export const MAP = 220 // world is a MAP x MAP square centered on origin

// ---- fog of war -------------------------------------------------------------
// Coarse grid over the map. `vis` = in a friendly unit's sight this frame,
// `seen` = ever explored (stays revealed as dimmed "shroud").
export const FOG_CELL = 4
export const FOG_N = Math.ceil(MAP / FOG_CELL)

// Deterministic RNG so a seed reproduces the same map
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createGame({ aiCount = 1, difficulty = 'normal', seed = null } = {}) {
  const rngSeed = seed ?? Math.floor(Math.random() * 2 ** 31)
  const rnd = mulberry32(rngSeed)
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal

  const g = {
    time: 0,
    tick: 0, // integer simulation step counter (drives lockstep + command timing)
    nextId: 1, // per-game entity id counter (kept in state so ids are deterministic)
    over: null, // 'win' | 'loss'
    seed: rngSeed,
    // Simulation RNG — a separate, reproducible stream from map generation so the
    // number of map-gen calls can change without shifting in-game randomness.
    // Both networked clients derive the identical stream from the shared seed.
    rng: mulberry32((rngSeed ^ 0x9e3779b9) >>> 0),
    localPlayer: 0, // which player this client controls (host = 0, joiner = 1 online)
    inputDelay: 1, // ticks between issuing a command and it executing (raised for netplay)
    commandsByTick: new Map(), // execTick -> [command,...]
    difficulty,
    diff,
    entities: new Map(),
    players: [],
    obstacles: [], // impassable: { x, z, r, model: 'mountain'|'rock', variant, rot, scale }
    decor: [],     // visual only: { x, z, model, variant, rot, scale }
    events: [],    // render/UI events: {type, ...}
    fog: {
      enabled: true,
      n: FOG_N,
      vis: new Uint8Array(FOG_N * FOG_N),  // 1 = currently in sight
      seen: new Uint8Array(FOG_N * FOG_N), // 1 = explored at least once
      dirty: true,
      visT: 0, // throttle accumulator
    },
  }

  const nPlayers = 1 + Math.max(1, Math.min(3, aiCount))
  for (let i = 0; i < nPlayers; i++) {
    g.players.push({
      name: PLAYER_NAMES[i], color: PLAYER_COLORS[i],
      w: 200, g: 100, age: 1, ageUp: null, // ageUp: { t } while researching
      isAI: i > 0, alive: true,
      ai: i > 0 ? { t: rnd() * 2, nextWave: diff.waveFirst, waveSize: diff.waveStart, attacking: false } : null,
    })
  }

  // corner spawns: player SW, AIs fill the rest
  const d = MAP / 2 - 26
  const corners = [[-d, d], [d, -d], [d, d], [-d, -d]]
  const spawns = corners.slice(0, nPlayers)
  g.spawns = spawns

  generateMap(g, rnd, spawns)
  for (let i = 0; i < nPlayers; i++) setupBase(g, i, spawns[i][0], spawns[i][1], rnd)

  updateVision(g) // reveal the starting area before the first frame

  return g
}

// ---- fog of war queries -----------------------------------------------------

export function sightRadius(e) {
  if (e.kind === 'building') {
    if (e.proto.kind === 'townhall') return 34
    if (e.proto.kind === 'turret') return 32
    return 22
  }
  return e.proto?.range ? Math.max(18, e.proto.range + 8) : 18
}

// Recompute the local player's visibility grid from their units & buildings.
export function updateVision(g) {
  const f = g.fog
  if (!f) return
  f.vis.fill(0)
  const n = f.n, half = MAP / 2
  for (const e of g.entities.values()) {
    if (e.dead || e.owner !== g.localPlayer) continue
    if (e.kind !== 'unit' && e.kind !== 'building') continue
    const r = sightRadius(e)
    const cx = (e.x + half) / FOG_CELL, cz = (e.z + half) / FOG_CELL, cr = r / FOG_CELL
    const x0 = Math.max(0, Math.floor(cx - cr)), x1 = Math.min(n - 1, Math.ceil(cx + cr))
    const z0 = Math.max(0, Math.floor(cz - cr)), z1 = Math.min(n - 1, Math.ceil(cz + cr))
    const cr2 = cr * cr
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dz = z + 0.5 - cz
        if (dx * dx + dz * dz <= cr2) { const i = z * n + x; f.vis[i] = 1; f.seen[i] = 1 }
      }
    }
  }
  f.dirty = true
}

function fogIndex(f, wx, wz) {
  const n = f.n, half = MAP / 2
  const x = Math.floor((wx + half) / FOG_CELL), z = Math.floor((wz + half) / FOG_CELL)
  if (x < 0 || z < 0 || x >= n || z >= n) return -1
  return z * n + x
}

export function isVisible(g, wx, wz) {
  const f = g.fog
  if (!f || !f.enabled) return true
  const i = fogIndex(f, wx, wz)
  return i < 0 ? true : f.vis[i] === 1
}

export function isExplored(g, wx, wz) {
  const f = g.fog
  if (!f || !f.enabled) return true
  const i = fogIndex(f, wx, wz)
  return i < 0 ? true : f.seen[i] === 1
}

// ---- procedural map ---------------------------------------------------------

function generateMap(g, rnd, spawns) {
  const lim = MAP / 2 - 8
  const nearSpawn = (x, z, r) => spawns.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < r)
  const nearObstacle = (x, z, pad) => g.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad)

  // mountains — impassable terrain features
  const nMountains = 5 + Math.floor(rnd() * 4)
  for (let i = 0; i < nMountains && g.obstacles.length < nMountains; ) {
    const x = (rnd() * 2 - 1) * lim
    const z = (rnd() * 2 - 1) * lim
    const variant = Math.floor(rnd() * 4)
    const r = variant === 1 ? 9 + rnd() * 3 : variant >= 2 ? 8 + rnd() * 3 : 5.5 + rnd() * 2
    if (nearSpawn(x, z, 42) || nearObstacle(x, z, r + 10)) { i += 0.25; continue }
    g.obstacles.push({ x, z, r, model: 'mountain', variant, rot: rnd() * Math.PI * 2, scale: 1 })
    i++
  }

  // neutral forests — clusters of tree nodes across the map
  const nForests = 9 + Math.floor(rnd() * 4)
  for (let i = 0; i < nForests; i++) {
    let x, z, tries = 0
    do {
      x = (rnd() * 2 - 1) * (lim - 6)
      z = (rnd() * 2 - 1) * (lim - 6)
      tries++
    } while ((nearSpawn(x, z, 34) || nearObstacle(x, z, 10)) && tries < 24)
    if (tries >= 24) continue
    const pine = rnd() < 0.45
    const n = 3 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, rr = k === 0 ? 0 : 4.5 + rnd() * 4
      const tx = x + Math.cos(a) * rr, tz = z + Math.sin(a) * rr
      if (Math.abs(tx) > lim || Math.abs(tz) > lim || nearObstacle(tx, tz, 4)) continue
      spawnResource(g, 'wood', tx, tz, 350 + Math.floor(rnd() * 100), { pine, rot: rnd() * Math.PI * 2 })
    }
  }

  // neutral gold in the midfield
  const nGold = 3 + Math.floor(rnd() * 3)
  for (let i = 0; i < nGold; i++) {
    let x, z, tries = 0
    do {
      x = (rnd() * 2 - 1) * lim * 0.55
      z = (rnd() * 2 - 1) * lim * 0.55
      tries++
    } while ((nearSpawn(x, z, 38) || nearObstacle(x, z, 8)) && tries < 24)
    if (tries >= 24) continue
    spawnResource(g, 'gold', x, z, 1100, { variant: Math.floor(rnd() * 3), rot: rnd() * Math.PI * 2 })
    spawnResource(g, 'gold', x + 4 + rnd() * 2, z + (rnd() * 4 - 2), 1100, { variant: Math.floor(rnd() * 3), rot: rnd() * Math.PI * 2 })
  }

  // decorative rocks and props (non-blocking)
  const nDecor = 46
  for (let i = 0; i < nDecor; i++) {
    const x = (rnd() * 2 - 1) * lim
    const z = (rnd() * 2 - 1) * lim
    if (nearSpawn(x, z, 22) || nearObstacle(x, z, 3)) continue
    const roll = rnd()
    const model = roll < 0.62 ? 'rock' : roll < 0.9 ? 'prop' : 'windmill'
    g.decor.push({
      x, z, model,
      variant: Math.floor(rnd() * (model === 'rock' ? 3 : model === 'prop' ? 3 : 1)),
      rot: rnd() * Math.PI * 2,
      scale: model === 'windmill' ? 1 : 0.6 + rnd() * 0.7,
    })
  }
}

function setupBase(g, owner, x, z, rnd) {
  const th = spawnBuilding(g, owner, 'towncenter', x, z, true)
  const toward = Math.atan2(-z, -x) // toward map center
  th.rally = { x: x + Math.cos(toward) * 9, z: z + Math.sin(toward) * 9 }

  // starting forest behind the base
  const back = Math.atan2(z, x)
  for (let i = 0; i < 4; i++) {
    const a = back + (i - 1.5) * 0.38
    const r = 13 + (i % 2) * 3
    spawnResource(g, 'wood', x + Math.cos(a) * r, z + Math.sin(a) * r, 420, { pine: i % 2 === 0, rot: rnd() * Math.PI * 2 })
  }
  // two gold piles flanking
  for (const s of [-1, 1]) {
    const a = back + s * 1.15
    spawnResource(g, 'gold', x + Math.cos(a) * 12, z + Math.sin(a) * 12, 1000, { variant: Math.floor(rnd() * 3), rot: rnd() * Math.PI * 2 })
  }
  // starting villagers
  for (let i = 0; i < 4; i++) {
    const u = spawnUnit(g, owner, 'villager', x + Math.cos(toward) * 7 + (i - 1.5) * 1.6, z + Math.sin(toward) * 7)
    autoGather(g, u)
  }
}

// ---- spawning ---------------------------------------------------------------

export function spawnUnit(g, owner, protoId, x, z) {
  const p = UNITS[protoId]
  const e = {
    id: g.nextId++, kind: 'unit', protoId, proto: p, owner,
    x, z, rot: 0,
    hp: p.hp, maxHp: p.hp, lastHit: -99,
    order: { type: 'idle' },
    atkT: 0, gatherT: 0, carry: null,
    buffSpeed: 1, buffAtk: 1, slowUntil: 0,
    dead: false,
  }
  g.entities.set(e.id, e)
  g.events.push({ type: 'spawn', id: e.id })
  return e
}

export function spawnBuilding(g, owner, protoId, x, z, complete = false) {
  const p = BUILDINGS[protoId]
  const e = {
    id: g.nextId++, kind: 'building', protoId, proto: p, owner,
    x, z, rot: 0,
    hp: complete ? p.hp : Math.max(10, p.hp * 0.05), maxHp: p.hp,
    lastHit: -99,
    constructing: !complete, progress: complete ? 1 : 0.05,
    queue: [], rally: null, atkT: 0, research: null, // research: { t } for Age Up
    age: g.players[owner].age, // visual age at construction time
    dead: false,
  }
  g.entities.set(e.id, e)
  g.events.push({ type: 'spawn', id: e.id })
  return e
}

export function spawnResource(g, rtype, x, z, amount, extra = {}) {
  const e = {
    id: g.nextId++, kind: 'resource', rtype, x, z,
    amount, maxAmount: amount,
    radius: rtype === 'wood' ? 2.3 : 1.7,
    pine: !!extra.pine, variant: extra.variant ?? 0, rot: extra.rot ?? 0,
    dead: false, depletedVisual: false,
    proto: { name: rtype === 'wood' ? 'Forest' : 'Gold Deposit', radius: rtype === 'wood' ? 2.3 : 1.7 },
  }
  g.entities.set(e.id, e)
  g.events.push({ type: 'spawn', id: e.id })
  return e
}

// ---- queries ---------------------------------------------------------------

export function dist(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.hypot(dx, dz) }

export function each(g, fn) { for (const e of g.entities.values()) if (!e.dead) fn(e) }

export function findNearest(g, from, pred, maxR = Infinity) {
  let best = null, bd = maxR
  for (const e of g.entities.values()) {
    if (e.dead || !pred(e)) continue
    const d = dist(from, e)
    if (d < bd) { bd = d; best = e }
  }
  return best
}

export function supplyOf(g, owner) {
  let used = 0, max = 0
  each(g, (e) => {
    if (e.owner !== owner) return
    if (e.kind === 'unit') used += e.proto.cost.supply
    if (e.kind === 'building' && !e.constructing && e.proto.supply) max += e.proto.supply
    if (e.kind === 'building' && e.queue) for (const q of e.queue) if (q.started) used += UNITS[q.protoId].cost.supply
  })
  return { used, max: Math.min(max, SUPPLY_CAP) }
}

export function ageOf(g, owner) { return g.players[owner].age }

export function hasTemple(g, owner) {
  let t = false
  each(g, (e) => { if (e.owner === owner && e.kind === 'building' && e.proto.kind === 'tech' && !e.constructing) t = true })
  return t
}

export function canAfford(g, owner, cost) {
  const p = g.players[owner]
  return p.w >= (cost.w || 0) && p.g >= (cost.g || 0)
}

export function pay(g, owner, cost) {
  const p = g.players[owner]
  p.w -= cost.w || 0
  p.g -= cost.g || 0
}

export function refund(g, owner, cost) {
  const p = g.players[owner]
  p.w += cost.w || 0
  p.g += cost.g || 0
}

export function autoGather(g, u) {
  const node = findNearest(g, u, (e) => e.kind === 'resource' && e.amount > 0, 65)
  if (node) u.order = { type: 'gather', nodeId: node.id }
}

// Obstacle test for placement + movement
export function blockedByObstacle(g, x, z, pad = 0) {
  for (const o of g.obstacles) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return o
  }
  return null
}
