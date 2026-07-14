import { UNITS, BUILDINGS, AGE_UP_COST, AGE_UP_TIME } from './data.js'
import {
  MAP, dist, each, findNearest, supplyOf, hasTemple, ageOf,
  canAfford, pay, spawnUnit, spawnBuilding, autoGather, blockedByObstacle, updateVision,
} from './state.js'

const VISION_INTERVAL = 0.25 // seconds between fog-of-war visibility recomputes

const GATHER_TIME = 1.8
const CARRY = 6
const DROP_RANGE = 1.5

export function tick(g, dt) {
  if (g.over) return
  g.time += dt
  g.tick++

  // apply any player commands scheduled for this exact tick (see issue/applyCommand)
  const batch = g.commandsByTick.get(g.tick)
  if (batch) { for (const c of batch) applyCommand(g, c); g.commandsByTick.delete(g.tick) }

  for (let i = 0; i < g.players.length; i++) if (g.players[i].isAI) aiThink(g, i, dt)

  each(g, (e) => {
    if (e.kind === 'unit') unitTick(g, e, dt)
    else if (e.kind === 'building') buildingTick(g, e, dt)
  })

  separation(g)
  auras(g, dt)
  cleanup(g)
  winCheck(g)

  if (g.fog?.enabled) {
    g.fog.visT += dt
    if (g.fog.visT >= VISION_INTERVAL) { g.fog.visT = 0; updateVision(g) }
  }
}

// ---- units -----------------------------------------------------------------

function unitTick(g, u, dt) {
  u.atkT = Math.max(0, u.atkT - dt)
  const o = u.order

  switch (o.type) {
    case 'idle': {
      if (u.proto.aggro > 0) {
        const t = acquire(g, u, u.proto.aggro)
        if (t) u.order = { type: 'attack', targetId: t.id, resume: { type: 'idle' } }
      } else if (u.proto.worker) {
        if (!u.idleT) u.idleT = 0
        u.idleT += dt
        if (u.idleT > 2) { u.idleT = 0; autoGather(g, u) }
      }
      break
    }
    case 'move': {
      if (arrive(g, u, o.x, o.z, 0.6, dt)) u.order = { type: 'idle' }
      break
    }
    case 'attackmove': {
      const t = acquire(g, u, Math.max(u.proto.aggro, 7))
      if (t) { u.order = { type: 'attack', targetId: t.id, resume: o }; break }
      if (arrive(g, u, o.x, o.z, 0.8, dt)) u.order = { type: 'idle' }
      break
    }
    case 'patrol': {
      const t = acquire(g, u, Math.max(u.proto.aggro, 7))
      if (t) { u.order = { type: 'attack', targetId: t.id, resume: o }; break }
      const tx = o.toB ? o.bx : o.ax, tz = o.toB ? o.bz : o.az
      if (arrive(g, u, tx, tz, 0.8, dt)) o.toB = !o.toB
      break
    }
    case 'attack': {
      const t = g.entities.get(o.targetId)
      if (!t || t.dead) { u.order = o.resume || { type: 'idle' }; break }
      const d = dist(u, t) - (t.proto.radius || t.radius || 1)
      const range = Math.max(u.proto.range, 0.6)
      if (d > range) moveToward(g, u, t.x, t.z, dt)
      else {
        u.rot = Math.atan2(t.z - u.z, t.x - u.x)
        if (u.atkT <= 0 && u.proto.dmg > 0) {
          u.atkT = u.proto.atkCd / u.buffAtk
          dealDamage(g, u, t)
        }
      }
      break
    }
    case 'gather': gatherTick(g, u, o, dt); break
    case 'return': returnTick(g, u, dt); break
    case 'build': {
      const site = g.entities.get(o.siteId)
      if (!site || site.dead || !site.constructing) { u.order = { type: 'idle' }; break }
      const d = dist(u, site) - site.proto.radius
      if (d > 1.2) moveToward(g, u, site.x, site.z, dt)
      else {
        site.progress = Math.min(1, site.progress + dt / site.proto.buildTime)
        site.hp = Math.min(site.maxHp, Math.max(site.hp, site.maxHp * site.progress))
        if (site.progress >= 1) {
          site.constructing = false
          g.events.push({ type: 'complete', id: site.id, owner: site.owner })
          u.order = { type: 'idle' }
          if (u.proto.worker) autoGather(g, u)
        }
      }
      break
    }
    case 'repair': {
      const t = g.entities.get(o.targetId)
      if (!t || t.dead || t.hp >= t.maxHp) { u.order = { type: 'idle' }; break }
      const d = dist(u, t) - (t.proto.radius || 1)
      if (d > 1.2) moveToward(g, u, t.x, t.z, dt)
      else t.hp = Math.min(t.maxHp, t.hp + 8 * dt)
      break
    }
  }
}

function gatherTick(g, u, o, dt) {
  if (u.carry) { u.order = { type: 'return', backTo: o }; return }
  let node = g.entities.get(o.nodeId)
  if (!node || node.dead || node.amount <= 0) {
    // No radius cap here either: local resources may be fully depleted, so the
    // next-nearest node — wherever on the map it is — is the right fallback.
    const sameType = node?.rtype
    const next = findNearest(g, u, (e) => e.kind === 'resource' && e.amount > 0 && (!sameType || e.rtype === sameType))
      || findNearest(g, u, (e) => e.kind === 'resource' && e.amount > 0)
    if (next) o.nodeId = next.id
    else u.order = { type: 'idle' }
    return
  }

  const d = dist(u, node) - node.radius
  if (d > 1.0) { moveToward(g, u, node.x, node.z, dt); u.gatherT = 0 }
  else {
    u.rot = Math.atan2(node.z - u.z, node.x - u.x)
    u.gatherT += dt
    if (u.gatherT >= GATHER_TIME) {
      u.gatherT = 0
      node.amount -= CARRY
      u.carry = { type: node.rtype === 'wood' ? 'w' : 'g', amt: CARRY }
      g.events.push({ type: 'gather', rtype: node.rtype, x: u.x, z: u.z })
      if (node.amount <= 0) g.events.push({ type: 'depleted', id: node.id, rtype: node.rtype })
      u.order = { type: 'return', backTo: o }
    }
  }
}

function returnTick(g, u, dt) {
  const drop = findNearest(g, u, (e) => e.kind === 'building' && e.owner === u.owner && e.proto.dropoff && !e.constructing)
  if (!drop) { u.order = { type: 'idle' }; return }
  const d = dist(u, drop) - drop.proto.radius
  if (d > DROP_RANGE) moveToward(g, u, drop.x, drop.z, dt)
  else {
    if (u.carry) {
      const p = g.players[u.owner]
      const mul = p.isAI ? g.diff.incomeMul : 1
      if (u.carry.type === 'w') p.w += u.carry.amt * mul; else p.g += u.carry.amt * mul
      u.carry = null
    }
    const back = u.order.backTo
    u.order = back ? { ...back } : { type: 'idle' }
  }
}

// ---- movement --------------------------------------------------------------

function speedOf(g, u) {
  let s = u.proto.speed * u.buffSpeed
  if (g.time < u.slowUntil) s *= 0.75
  return s
}

function moveToward(g, u, tx, tz, dt) {
  let dx = tx - u.x, dz = tz - u.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-4) return
  dx /= d; dz /= d

  // steer around mountains: if heading into an obstacle, slide along its tangent
  const probe = 2.2 + u.proto.radius
  const ob = blockedByObstacle(g, u.x + dx * probe, u.z + dz * probe, u.proto.radius)
  if (ob) {
    const ox = u.x - ob.x, oz = u.z - ob.z
    const ol = Math.hypot(ox, oz) || 1
    // pick the tangent direction that still makes progress toward the target
    const t1x = -oz / ol, t1z = ox / ol
    const dot1 = t1x * dx + t1z * dz
    const sx = dot1 >= 0 ? t1x : -t1x
    const sz = dot1 >= 0 ? t1z : -t1z
    dx = sx * 0.85 + (ox / ol) * 0.15 // tangent plus slight outward push
    dz = sz * 0.85 + (oz / ol) * 0.15
    const dl = Math.hypot(dx, dz) || 1
    dx /= dl; dz /= dl
  }

  const s = Math.min(speedOf(g, u) * dt, d)
  u.x += dx * s
  u.z += dz * s
  u.rot = Math.atan2(dz, dx)

  // hard push out of obstacle interiors
  const inside = blockedByObstacle(g, u.x, u.z, u.proto.radius * 0.5)
  if (inside) {
    const ox = u.x - inside.x, oz = u.z - inside.z
    const ol = Math.hypot(ox, oz) || 1
    const want = inside.r + u.proto.radius * 0.5
    u.x = inside.x + (ox / ol) * want
    u.z = inside.z + (oz / ol) * want
  }

  const lim = MAP / 2 - 2
  u.x = Math.max(-lim, Math.min(lim, u.x))
  u.z = Math.max(-lim, Math.min(lim, u.z))
}

function arrive(g, u, tx, tz, eps, dt) {
  const d = Math.hypot(tx - u.x, tz - u.z)
  if (d <= eps) return true
  moveToward(g, u, tx, tz, dt)
  return false
}

function separation(g) {
  const units = []
  each(g, (e) => { if (e.kind === 'unit') units.push(e) })
  for (let i = 0; i < units.length; i++) {
    const a = units[i]
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]
      const dx = b.x - a.x, dz = b.z - a.z
      const rr = a.proto.radius + b.proto.radius
      const d2 = dx * dx + dz * dz
      if (d2 > rr * rr || d2 < 1e-6) continue
      const d = Math.sqrt(d2)
      const push = (rr - d) / 2
      const nx = dx / d, nz = dz / d
      a.x -= nx * push; a.z -= nz * push
      b.x += nx * push; b.z += nz * push
    }
    // push out of buildings
    each(g, (s) => {
      if (s.kind !== 'building') return
      const dx = a.x - s.x, dz = a.z - s.z
      const rr = s.proto.radius + a.proto.radius * 0.6
      const d2 = dx * dx + dz * dz
      if (d2 > rr * rr || d2 < 1e-6) return
      const d = Math.sqrt(d2)
      a.x = s.x + (dx / d) * rr
      a.z = s.z + (dz / d) * rr
    })
  }
}

// ---- combat ----------------------------------------------------------------

function acquire(g, u, radius) {
  return findNearest(g, u, (e) =>
    (e.kind === 'unit' || e.kind === 'building') && e.owner !== undefined &&
    e.owner >= 0 && e.owner !== u.owner, radius)
}

function dealDamage(g, src, target) {
  g.events.push({
    type: 'shot', from: { x: src.x, z: src.z }, to: { x: target.x, z: target.z },
    owner: src.owner, srcProto: src.protoId, splash: !!src.proto.splash,
  })
  applyHit(g, src, target, src.proto.dmg)
  if (src.proto.splash) {
    each(g, (e) => {
      if (e === target || e.owner === undefined || e.owner < 0 || e.owner === src.owner) return
      if (e.kind !== 'unit' && e.kind !== 'building') return
      if (dist(e, target) <= src.proto.splash) applyHit(g, src, e, src.proto.dmg * 0.5)
    })
  }
}

function applyHit(g, src, e, dmg) {
  e.lastHit = g.time
  e.hp -= dmg
  if (e.hp <= 0 && !e.dead) kill(g, e)
  // fight back: idle victims aggro their attacker
  if (!e.dead && e.kind === 'unit' && e.order.type === 'idle' && e.proto.dmg > 0 && src.kind === 'unit') {
    e.order = { type: 'attack', targetId: src.id, resume: { type: 'idle' } }
  }
}

function kill(g, e) {
  e.dead = true
  g.events.push({ type: 'death', id: e.id, x: e.x, z: e.z, kind: e.kind })
}

// ---- buildings -------------------------------------------------------------

function buildingTick(g, b, dt) {
  if (b.constructing) return

  // turret fire
  if (b.proto.kind === 'turret') {
    b.atkT = Math.max(0, b.atkT - dt)
    const t = findNearest(g, b, (e) => (e.kind === 'unit' || e.kind === 'building') && e.owner >= 0 && e.owner !== b.owner, b.proto.range)
    if (t && b.atkT <= 0) {
      b.atkT = b.proto.atkCd
      g.events.push({ type: 'shot', from: { x: b.x, z: b.z }, to: { x: t.x, z: t.z }, owner: b.owner, srcProto: 'watchtower', splash: false })
      applyHit(g, b, t, b.proto.dmg)
    }
  }

  // Age Up research
  if (b.research) {
    b.research.t -= dt
    if (b.research.t <= 0) {
      b.research = null
      const p = g.players[b.owner]
      p.age = 2
      p.ageUp = null
      each(g, (e) => { if (e.kind === 'building' && e.owner === b.owner) e.age = 2 })
      g.events.push({ type: 'ageup', owner: b.owner })
    }
  }

  // production
  if (b.queue.length > 0) {
    const item = b.queue[0]
    if (!item.started) {
      const proto = UNITS[item.protoId]
      const sup = supplyOf(g, b.owner)
      if (sup.used + proto.cost.supply <= sup.max) { item.started = true; item.t = proto.buildTime }
    } else {
      item.t -= dt
      if (item.t <= 0) {
        b.queue.shift()
        const proto = UNITS[item.protoId]
        const a = Math.atan2((b.rally?.z ?? b.z + 5) - b.z, (b.rally?.x ?? b.x) - b.x)
        const u = spawnUnit(g, b.owner, item.protoId, b.x + Math.cos(a) * (b.proto.radius + 1.2), b.z + Math.sin(a) * (b.proto.radius + 1.2))
        if (proto.worker) autoGather(g, u)
        else if (b.rally) u.order = { type: 'attackmove', x: b.rally.x, z: b.rally.z }
        g.events.push({ type: 'trained', id: u.id, owner: b.owner })
      }
    }
  }
}

// ---- auras -------------------------------------------------------------------

function auras(g, dt) {
  const casters = []
  each(g, (e) => { if (e.kind === 'unit' && e.proto.aura) casters.push(e) })
  each(g, (e) => { if (e.kind === 'unit') { e.buffSpeed = 1; e.buffAtk = 1 } })
  for (const c of casters) {
    const a = c.proto.aura
    each(g, (e) => {
      if (e.owner !== c.owner || e === c || e.kind !== 'unit') return
      if (dist(c, e) > a.radius) return
      if (a.type === 'heal') e.hp = Math.min(e.maxHp, e.hp + a.rate * dt)
    })
  }
}

function cleanup(g) {
  for (const [id, e] of g.entities) {
    if (e.dead) g.entities.delete(id)
    else if (e.kind === 'resource' && e.amount <= 0) {
      if (e.rtype === 'gold') {
        e.dead = true
        g.entities.delete(id)
        g.events.push({ type: 'death', id, x: e.x, z: e.z, kind: 'resource' })
      } else if (!e.depletedVisual) {
        // depleted forests remain as stumps (visual swap, no removal)
        e.depletedVisual = true
      }
    }
  }
}

function winCheck(g) {
  const alive = g.players.map(() => false)
  each(g, (e) => {
    if (e.kind === 'building' && e.proto.kind === 'townhall' && !e.constructing) alive[e.owner] = true
  })
  for (let i = 0; i < g.players.length; i++) {
    const p = g.players[i]
    if (p.alive && !alive[i]) {
      p.alive = false
      g.events.push({ type: 'eliminated', owner: i })
    }
  }
  // This branch is derived from `alive[]`, which every client computes identically
  // from shared entity state, so both sides of an online match reach g.over on the
  // same tick — only the win/loss label differs, per each client's own localPlayer.
  if (!g.players[g.localPlayer].alive) g.over = 'loss'
  else if (g.players.filter((p) => p.alive).length <= 1) g.over = 'win'
}

// ---- command layer (deterministic, network-ready) ---------------------------
// Player actions are enqueued as serializable commands scheduled for a future
// tick, then applied identically on every client. The AI runs inside the tick
// and calls the cmd* helpers directly — it is already deterministic via g.rng.

// Schedule a locally-issued command; returns the tick it will execute on.
// If g.onCommand is set (wired by the net layer for online matches) it is notified
// so the command can be broadcast to the peer tagged with the same exec tick.
export function issue(g, cmd) {
  const et = g.tick + g.inputDelay
  scheduleAt(g, et, cmd)
  g.onCommand?.(et, cmd)
  return et
}

// Schedule a command for an exact exec tick — used both by issue() above and by
// the net layer when applying a command received from a remote peer.
export function scheduleAt(g, execTick, cmd) {
  let arr = g.commandsByTick.get(execTick)
  if (!arr) { arr = []; g.commandsByTick.set(execTick, arr) }
  arr.push(cmd)
}

function resolveUnits(g, ids) {
  const out = []
  for (const id of ids) { const e = g.entities.get(id); if (e && !e.dead && e.kind === 'unit') out.push(e) }
  return out
}

// Apply one command to the simulation. Every field is a primitive or id so a
// command survives JSON round-tripping across the network unchanged.
export function applyCommand(g, c) {
  switch (c.t) {
    case 'move': { const u = resolveUnits(g, c.units); if (u.length) cmdMove(g, u, c.x, c.z, c.am); break }
    case 'attack': {
      const u = resolveUnits(g, c.units); const tgt = g.entities.get(c.target)
      if (u.length && tgt && !tgt.dead) cmdAttack(g, u, tgt); break
    }
    case 'gather': {
      const u = resolveUnits(g, c.units); const n = g.entities.get(c.node)
      if (u.length && n && !n.dead) cmdGather(g, u, n); break
    }
    case 'repair': {
      const u = resolveUnits(g, c.units); const tgt = g.entities.get(c.target)
      if (u.length && tgt && !tgt.dead) cmdRepair(g, u, tgt); break
    }
    case 'construct': {
      const u = resolveUnits(g, c.units).filter((e) => e.proto.worker); const s = g.entities.get(c.site)
      if (u.length && s && !s.dead && s.constructing) u.forEach((w) => { w.order = { type: 'build', siteId: s.id } })
      break
    }
    case 'rally': { const b = g.entities.get(c.b); if (b && !b.dead) b.rally = { x: c.x, z: c.z }; break }
    case 'patrol': {
      const u = resolveUnits(g, c.units)
      u.forEach((w) => { w.order = { type: 'patrol', ax: w.x, az: w.z, bx: c.x, bz: c.z, toB: true } })
      break
    }
    case 'build': {
      const b = g.entities.get(c.builder)
      const r = tryPlaceBuilding(g, c.p, c.proto, c.x, c.z, b && !b.dead ? b : null)
      if (!r.ok && c.p === g.localPlayer) g.events.push({ type: 'cmdfail', owner: c.p, reason: r.reason })
      break
    }
    case 'queue': {
      const b = g.entities.get(c.b)
      if (b && !b.dead && b.owner === c.p) {
        const r = tryQueueUnit(g, b, c.proto)
        if (!r.ok && c.p === g.localPlayer) g.events.push({ type: 'cmdfail', owner: c.p, reason: r.reason })
      }
      break
    }
    case 'ageup': {
      const tc = g.entities.get(c.tc)
      if (tc && !tc.dead && tc.owner === c.p) {
        const r = tryAgeUp(g, tc)
        if (!r.ok && c.p === g.localPlayer) g.events.push({ type: 'cmdfail', owner: c.p, reason: r.reason })
      }
      break
    }
  }
}

// Order-independent-per-tick hash of the whole simulation for desync detection.
export function checksum(g) {
  let h = 0x811c9dc5 >>> 0
  const mix = (n) => { h ^= n >>> 0; h = Math.imul(h, 0x01000193) >>> 0 }
  mix(g.tick)
  for (const e of g.entities.values()) {
    if (e.dead) continue
    mix(e.id)
    mix((e.x * 16) | 0)
    mix((e.z * 16) | 0)
    mix((e.hp * 4) | 0)
    if (e.kind === 'unit') mix(ORDER_CODE[e.order?.type] || 0)
    if (e.kind === 'resource') mix(e.amount | 0)
  }
  for (const p of g.players) { mix(p.w | 0); mix(p.g | 0); mix(p.age); mix(p.alive ? 1 : 0) }
  return h >>> 0
}

const ORDER_CODE = { idle: 1, move: 2, attackmove: 3, attack: 4, gather: 5, return: 6, build: 7, repair: 8, patrol: 9 }

// ---- commands (player + AI use the same API) --------------------------------

export function cmdMove(g, units, x, z, attackMove = false) {
  const n = units.length
  units.forEach((u, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    const r = i === 0 ? 0 : 0.9 + Math.floor(i / 7) * 1.2
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r
    u.order = attackMove
      ? { type: 'attackmove', x: x + ox, z: z + oz }
      : { type: 'move', x: x + ox, z: z + oz }
  })
}

export function cmdAttack(g, units, target) {
  units.forEach((u) => { u.order = { type: 'attack', targetId: target.id, resume: { type: 'idle' } } })
}

export function cmdGather(g, units, node) {
  units.forEach((u) => { if (u.proto.worker) u.order = { type: 'gather', nodeId: node.id } })
}

export function cmdRepair(g, units, target) {
  units.forEach((u) => { if (u.proto.repairs) u.order = { type: 'repair', targetId: target.id } })
}

export function checkPlacement(g, owner, protoId, x, z) {
  const proto = BUILDINGS[protoId]
  let blocked = false
  each(g, (e) => {
    if (blocked) return
    if (e.kind === 'building' && dist(e, { x, z }) < e.proto.radius + proto.radius + 0.8) blocked = true
    if (e.kind === 'resource' && e.amount > 0 && dist(e, { x, z }) < e.radius + proto.radius + 0.5) blocked = true
  })
  if (!blocked && blockedByObstacle(g, x, z, proto.radius + 1)) blocked = true
  const lim = MAP / 2 - 4
  if (Math.abs(x) > lim || Math.abs(z) > lim) blocked = true
  if (blocked) return { ok: false, reason: 'Blocked placement', x, z }
  return { ok: true, x, z }
}

export function tryPlaceBuilding(g, owner, protoId, x, z, builder) {
  const proto = BUILDINGS[protoId]
  if (!canAfford(g, owner, proto.cost)) return { ok: false, reason: 'Not enough resources' }
  const chk = checkPlacement(g, owner, protoId, x, z)
  if (!chk.ok) return chk

  pay(g, owner, proto.cost)
  const b = spawnBuilding(g, owner, protoId, chk.x, chk.z, false)
  if (builder) builder.order = { type: 'build', siteId: b.id }
  return { ok: true, building: b }
}

export function tryQueueUnit(g, b, protoId) {
  const proto = UNITS[protoId]
  if (b.constructing) return { ok: false, reason: 'Under construction' }
  if (b.queue.length >= 5) return { ok: false, reason: 'Queue full' }
  if (proto.age > ageOf(g, b.owner)) return { ok: false, reason: 'Requires Age II' }
  if (!canAfford(g, b.owner, proto.cost)) return { ok: false, reason: 'Not enough resources' }
  const sup = supplyOf(g, b.owner)
  if (sup.used + proto.cost.supply > sup.max) return { ok: false, reason: 'Supply blocked — build a Farm' }
  pay(g, b.owner, proto.cost)
  b.queue.push({ protoId, started: false, t: 0 })
  return { ok: true }
}

export function tryAgeUp(g, tc) {
  const owner = tc.owner
  const p = g.players[owner]
  if (p.age >= 2) return { ok: false, reason: 'Already in Age II' }
  if (tc.research) return { ok: false, reason: 'Already researching' }
  if (!hasTemple(g, owner)) return { ok: false, reason: 'Requires a Temple' }
  if (!canAfford(g, owner, AGE_UP_COST)) return { ok: false, reason: 'Not enough resources' }
  pay(g, owner, AGE_UP_COST)
  tc.research = { t: AGE_UP_TIME, total: AGE_UP_TIME }
  p.ageUp = tc.research
  return { ok: true }
}

// ---- AI ----------------------------------------------------------------------

function aiThink(g, owner, dt) {
  const p = g.players[owner]
  if (!p.alive) return
  const ai = p.ai
  ai.t -= dt
  if (ai.t > 0) return
  ai.t = 1.5
  const diff = g.diff

  const th = findAI(g, owner, (e) => e.kind === 'building' && e.proto.kind === 'townhall' && !e.constructing)
  if (!th) return

  const workers = listAI(g, owner, (e) => e.kind === 'unit' && e.proto.worker)
  const army = listAI(g, owner, (e) => e.kind === 'unit' && !e.proto.worker)
  const barracks = findAI(g, owner, (e) => e.kind === 'building' && e.protoId === 'barracks' && !e.constructing)
  const archery = findAI(g, owner, (e) => e.kind === 'building' && e.protoId === 'archery' && !e.constructing)
  const anyBarracks = findAI(g, owner, (e) => e.kind === 'building' && e.protoId === 'barracks')
  const anyArchery = findAI(g, owner, (e) => e.kind === 'building' && e.protoId === 'archery')
  const temple = findAI(g, owner, (e) => e.kind === 'building' && e.protoId === 'temple')
  const sup = supplyOf(g, owner)

  // train workers
  if (workers.length < diff.workers && th.queue.length === 0 && sup.used < sup.max) {
    tryQueueUnit(g, th, 'villager')
  }

  // supply (farms)
  if (sup.max - sup.used < 5 && sup.max < 70) {
    const pending = findAI(g, owner, (e) => e.kind === 'building' && e.proto.supply && e.constructing)
    if (!pending) aiBuild(g, owner, 'farm', th, workers)
  }

  // military buildings
  if (!anyBarracks && g.time > 60) aiBuild(g, owner, 'barracks', th, workers)
  if (!anyArchery && g.time > 150) aiBuild(g, owner, 'archery', th, workers)

  // temple + age up
  if (!temple && g.time > diff.ageAt - 90) aiBuild(g, owner, 'temple', th, workers)
  if (p.age === 1 && g.time > diff.ageAt && temple && !temple.constructing && !th.research) {
    tryAgeUp(g, th)
  }

  // keep some workers on gold (Villagers and most units need it)
  const onGold = workers.filter((w) => {
    if (w.order.type !== 'gather' && !(w.order.type === 'return' && w.order.backTo)) return false
    const nid = w.order.nodeId ?? w.order.backTo?.nodeId
    const n = nid && g.entities.get(nid)
    return n && n.rtype === 'gold'
  })
  if (onGold.length < Math.min(4, Math.floor(workers.length / 3))) {
    const goldNode = findNearest(g, th, (e) => e.kind === 'resource' && e.rtype === 'gold' && e.amount > 0)
    const w = workers.find((w2) => w2.order.type === 'gather' && g.entities.get(w2.order.nodeId)?.rtype === 'wood')
    if (goldNode && w) w.order = { type: 'gather', nodeId: goldNode.id }
  }

  // army production
  if (army.length < diff.armyCap) {
    if (barracks && barracks.queue.length < 2) {
      const pick = p.age >= 2 && g.rng() > 0.5 ? 'knight' : 'swordsman'
      tryQueueUnit(g, barracks, pick)
    }
    if (archery && archery.queue.length < 2) {
      const roll = g.rng()
      const pick = p.age >= 2 && roll > 0.75 ? 'catapult' : 'archer'
      tryQueueUnit(g, archery, pick)
    }
    if (p.age >= 2 && temple && !temple.constructing && temple.queue.length === 0 && g.rng() > 0.7) {
      tryQueueUnit(g, temple, 'priest')
    }
  }

  // attack waves
  if (!ai.attacking && g.time > ai.nextWave && army.length >= Math.min(ai.waveSize, diff.armyCap)) {
    ai.attacking = true
    const target = aiPickTarget(g, owner, th)
    if (target) {
      cmdMove(g, army, target.x, target.z, true)
      if (target.owner >= 0) g.events.push({ type: 'wave', size: army.length, owner, target: target.owner })
    }
  }
  if (ai.attacking) {
    const busy = army.filter((u) => u.order.type !== 'idle')
    if (busy.length === 0) {
      ai.attacking = false
      ai.waveSize += diff.waveGrow
      ai.nextWave = g.time + diff.waveEvery
    }
  }
}

function aiPickTarget(g, owner, th) {
  // nearest enemy town hall (free-for-all: any other alive player)
  let best = null, bd = Infinity
  each(g, (e) => {
    if (e.kind !== 'building' || e.proto.kind !== 'townhall' || e.owner === owner) return
    if (!g.players[e.owner].alive) return
    const d = dist(th, e)
    if (d < bd) { bd = d; best = e }
  })
  if (!best) each(g, (e) => { if (!best && e.owner !== undefined && e.owner >= 0 && e.owner !== owner && e.kind !== 'resource') best = e })
  return best
}

function aiBuild(g, owner, protoId, th, workers) {
  const w = workers.find((x) => x.order.type === 'gather' || x.order.type === 'idle')
  if (!w) return
  for (let attempt = 0; attempt < 10; attempt++) {
    const a = g.rng() * Math.PI * 2
    const r = 8 + g.rng() * 11
    const x = th.x + Math.cos(a) * r, z = th.z + Math.sin(a) * r
    const res = tryPlaceBuilding(g, owner, protoId, x, z, w)
    if (res.ok) return
  }
}

function findAI(g, owner, pred) {
  let f = null
  each(g, (e) => { if (!f && e.owner === owner && pred(e)) f = e })
  return f
}

function listAI(g, owner, pred) {
  const out = []
  each(g, (e) => { if (e.owner === owner && pred(e)) out.push(e) })
  return out
}
