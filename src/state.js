import { UNITS, BUILDINGS, SUPPLY_CAP, POWER_RADIUS, EXTRACTOR_OF, FACTIONS } from './data.js'

export const MAP = 170 // world is a MAP x MAP square centered on origin

let nextId = 1

export function createGame(playerFaction, aiFaction) {
  const g = {
    time: 0,
    over: null, // 'win' | 'loss'
    entities: new Map(),
    players: [
      { faction: playerFaction, s: 50, z: 0, isAI: false },
      { faction: aiFaction, s: 50, z: 0, isAI: true, ai: { t: 0, wave: 16, attacking: false } },
    ],
    events: [], // render/UI events: {type, ...}
  }

  const d = MAP / 2 - 22
  setupBase(g, 0, -d, d)   // player: south-west
  setupBase(g, 1, d, -d)   // AI: north-east
  // neutral expansion resources mid-map
  spawnPatch(g, 0, 0, 5)
  return g
}

function setupBase(g, owner, x, z) {
  const p = g.players[owner]
  const thProto = FACTIONS[p.faction].townHall
  const th = spawnBuilding(g, owner, thProto, x, z, true)
  th.rally = { x: x + dirTo(x, z, 8), z: z + dirTo(z, x, 8) }
  // mineral line: arc of shiny nodes behind the town hall
  const away = Math.atan2(z, x) // outward from center
  for (let i = 0; i < 6; i++) {
    const a = away + (i - 2.5) * 0.22
    const r = 11 + (i % 2) * 1.6
    spawnResource(g, 'shiny', x + Math.cos(a) * r, z + Math.sin(a) * r, 1500)
  }
  spawnResource(g, 'geyser', x + Math.cos(away + 1.35) * 12, z + Math.sin(away + 1.35) * 12, 2500)
  spawnResource(g, 'geyser', x + Math.cos(away - 1.35) * 12, z + Math.sin(away - 1.35) * 12, 2500)
  // starting workers
  const wProto = FACTIONS[p.faction].worker
  for (let i = 0; i < 4; i++) {
    const u = spawnUnit(g, owner, wProto, x + Math.cos(away) * 6 + i * 1.6 - 2.4, z + Math.sin(away) * 6)
    autoGather(g, u)
  }
}

function dirTo(a, b, m) { return (a === 0 ? 1 : -Math.sign(a)) * m }

function spawnPatch(g, x, z, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    spawnResource(g, 'shiny', x + Math.cos(a) * 6, z + Math.sin(a) * 6, 1200)
  }
}

export function spawnUnit(g, owner, protoId, x, z) {
  const p = UNITS[protoId]
  const e = {
    id: nextId++, kind: 'unit', protoId, proto: p, owner,
    x, z, rot: 0,
    hp: p.hp, maxHp: p.hp,
    shield: p.shield || 0, maxShield: p.shield || 0, lastHit: -99,
    order: { type: 'idle' },
    atkT: 0, gatherT: 0, carry: null,
    buffSpeed: 1, buffAtk: 1, slowUntil: 0,
    dead: false,
  }
  g.entities.set(e.id, e)
  g.events.push({ type: 'spawn', id: e.id })
  return e
}

export function spawnBuilding(g, owner, protoId, x, z, complete = false, geyserId = null) {
  const p = BUILDINGS[protoId]
  const e = {
    id: nextId++, kind: 'building', protoId, proto: p, owner,
    x, z, rot: 0,
    hp: complete ? p.hp : Math.max(10, p.hp * 0.05), maxHp: p.hp,
    shield: complete ? (p.shield || 0) : 0, maxShield: p.shield || 0, lastHit: -99,
    constructing: !complete, progress: complete ? 1 : 0.05,
    queue: [], rally: null, atkT: 0,
    powered: true, geyserId,
    dead: false,
  }
  g.entities.set(e.id, e)
  g.events.push({ type: 'spawn', id: e.id })
  return e
}

export function spawnResource(g, rtype, x, z, amount) {
  const e = {
    id: nextId++, kind: 'resource', rtype, x, z,
    amount, radius: rtype === 'geyser' ? 1.8 : 1.1,
    extractorId: null, dead: false,
    proto: { name: rtype === 'geyser' ? 'Citrus Geyser' : 'Shiny Crystals', radius: rtype === 'geyser' ? 1.8 : 1.1 },
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

export function hasTech(g, owner) {
  let t = false
  each(g, (e) => { if (e.owner === owner && e.kind === 'building' && e.proto.kind === 'tech' && !e.constructing) t = true })
  return t
}

export function isPowered(g, e) {
  if (e.kind !== 'building' || !e.proto.needsPower) return true
  let ok = false
  each(g, (p) => {
    if (!ok && p.kind === 'building' && p.owner === e.owner && p.proto.power && !p.constructing && dist(p, e) <= POWER_RADIUS) ok = true
  })
  return ok
}

export function canAfford(g, owner, cost) {
  const p = g.players[owner]
  return p.s >= (cost.s || 0) && p.z >= (cost.z || 0)
}

export function pay(g, owner, cost) {
  const p = g.players[owner]
  p.s -= cost.s || 0
  p.z -= cost.z || 0
}

export function refund(g, owner, cost) {
  const p = g.players[owner]
  p.s += cost.s || 0
  p.z += cost.z || 0
}

export function autoGather(g, u) {
  const node = findNearest(g, u, (e) => e.kind === 'resource' && e.rtype === 'shiny' && e.amount > 0, 60)
  if (node) u.order = { type: 'gather', nodeId: node.id }
}

export function extractorProtoFor(g, owner) {
  return EXTRACTOR_OF[g.players[owner].faction]
}
