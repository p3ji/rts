import { UNITS, BUILDINGS } from './data.js'
import {
  MAP, dist, each, findNearest, supplyOf, hasTech, isPowered,
  canAfford, pay, spawnUnit, spawnBuilding, autoGather, extractorProtoFor,
} from './state.js'

const GATHER_TIME = 1.9
const CARRY = 5
const DROP_RANGE = 1.5

export function tick(g, dt) {
  if (g.over) return
  g.time += dt

  aiThink(g, dt)

  each(g, (e) => {
    if (e.kind === 'unit') unitTick(g, e, dt)
    else if (e.kind === 'building') buildingTick(g, e, dt)
  })

  separation(g)
  auras(g, dt)
  shieldRegen(g, dt)
  cleanup(g)
  winCheck(g)
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
        // idle workers drift back to work
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
          site.shield = site.maxShield
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
      else t.hp = Math.min(t.maxHp, t.hp + 6 * dt)
      break
    }
  }
}

function gatherTick(g, u, o, dt) {
  if (u.carry) { u.order = { type: 'return', backTo: o }; return }
  let node = g.entities.get(o.nodeId)
  // geysers redirect to their extractor once built
  if (node && node.kind === 'resource' && node.rtype === 'geyser' && node.extractorId) {
    const ex = g.entities.get(node.extractorId)
    if (ex && !ex.dead && !ex.constructing && ex.owner === u.owner) { o.nodeId = ex.id; node = ex }
  }
  if (!node || node.dead || depleted(node)) {
    const next = findNearest(g, u, (e) => e.kind === 'resource' && e.rtype === 'shiny' && e.amount > 0, 45)
    if (next) o.nodeId = next.id
    else u.order = { type: 'idle' }
    return
  }
  // can't harvest a raw geyser
  if (node.kind === 'resource' && node.rtype === 'geyser' && !node.extractorId) { u.order = { type: 'idle' }; return }
  // extractor must be finished and owned
  if (node.kind === 'building' && (node.constructing || node.owner !== u.owner)) { u.order = { type: 'idle' }; return }

  const nodeR = node.proto?.radius ?? node.radius ?? 1
  const d = dist(u, node) - nodeR
  if (d > 1.0) { moveToward(g, u, node.x, node.z, dt); u.gatherT = 0 }
  else {
    u.gatherT += dt
    if (u.gatherT >= GATHER_TIME) {
      u.gatherT = 0
      if (node.kind === 'building') {
        const gey = g.entities.get(node.geyserId)
        if (gey && gey.amount > 0) { gey.amount -= CARRY; u.carry = { type: 'z', amt: CARRY } }
      } else {
        node.amount -= CARRY
        u.carry = { type: 's', amt: CARRY }
        if (node.amount <= 0) g.events.push({ type: 'depleted', id: node.id })
      }
      if (u.carry) u.order = { type: 'return', backTo: o }
    }
  }
}

function depleted(node) {
  if (node.kind === 'building') { return false }
  return node.amount <= 0
}

function returnTick(g, u, dt) {
  const th = findNearest(g, u, (e) => e.kind === 'building' && e.owner === u.owner && e.proto.kind === 'townhall' && !e.constructing)
  if (!th) { u.order = { type: 'idle' }; return }
  const d = dist(u, th) - th.proto.radius
  if (d > DROP_RANGE) moveToward(g, u, th.x, th.z, dt)
  else {
    if (u.carry) {
      const p = g.players[u.owner]
      if (u.carry.type === 's') p.s += u.carry.amt; else p.z += u.carry.amt
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
  const dx = tx - u.x, dz = tz - u.z
  const d = Math.hypot(dx, dz)
  if (d < 1e-4) return
  const s = speedOf(g, u) * dt
  const k = Math.min(1, s / d)
  u.x += dx * k
  u.z += dz * k
  u.rot = Math.atan2(dz, dx)
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
  g.events.push({ type: 'shot', from: { x: src.x, z: src.z }, to: { x: target.x, z: target.z }, owner: src.owner })
  applyHit(g, src, target, src.proto.dmg * (src.buffAtk >= 1 ? 1 : 1))
  if (src.proto.splash) {
    each(g, (e) => {
      if (e === target || e.owner === undefined || e.owner < 0 || e.owner === src.owner) return
      if (e.kind !== 'unit' && e.kind !== 'building') return
      if (dist(e, target) <= src.proto.splash) applyHit(g, src, e, src.proto.dmg * 0.5)
    })
  }
  if (src.proto.slow && target.kind === 'unit') target.slowUntil = g.time + src.proto.slow.dur
}

function applyHit(g, src, e, dmg) {
  e.lastHit = g.time
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg)
    e.shield -= absorbed
    dmg -= absorbed
  }
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
  b.powered = isPowered(g, b)

  // turret fire
  if (b.proto.kind === 'turret' && b.powered) {
    b.atkT = Math.max(0, b.atkT - dt)
    const t = findNearest(g, b, (e) => (e.kind === 'unit' || e.kind === 'building') && e.owner >= 0 && e.owner !== b.owner, b.proto.range)
    if (t && b.atkT <= 0) {
      b.atkT = b.proto.atkCd
      g.events.push({ type: 'shot', from: { x: b.x, z: b.z }, to: { x: t.x, z: t.z }, owner: b.owner })
      applyHit(g, b, t, b.proto.dmg)
    }
  }

  // production
  if (b.queue.length > 0 && b.powered) {
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

// ---- auras / regen ----------------------------------------------------------

function auras(g, dt) {
  const casters = []
  each(g, (e) => { if (e.kind === 'unit' && e.proto.aura) casters.push(e) })
  // reset buffs
  each(g, (e) => { if (e.kind === 'unit') { e.buffSpeed = 1; e.buffAtk = 1 } })
  for (const c of casters) {
    const a = c.proto.aura
    each(g, (e) => {
      if (e.owner !== c.owner || e === c) return
      if (e.kind !== 'unit' && !(a.type === 'heal' && e.kind === 'building')) return
      if (dist(c, e) > a.radius) return
      if (a.type === 'heal') e.hp = Math.min(e.maxHp, e.hp + a.rate * dt)
      else if (a.type === 'frenzy') { e.buffSpeed = a.speedMul; e.buffAtk = a.atkMul }
      else if (a.type === 'shieldregen') e.shield = Math.min(e.maxShield, e.shield + a.rate * dt)
    })
  }
}

function shieldRegen(g, dt) {
  each(g, (e) => {
    if (e.maxShield > 0 && !e.constructing && g.time - e.lastHit > 5) {
      e.shield = Math.min(e.maxShield, e.shield + 2 * dt)
    }
  })
}

function cleanup(g) {
  for (const [id, e] of g.entities) {
    if (e.dead) g.entities.delete(id)
    else if (e.kind === 'resource' && e.rtype === 'shiny' && e.amount <= 0) {
      e.dead = true
      g.entities.delete(id)
      g.events.push({ type: 'death', id, x: e.x, z: e.z, kind: 'resource' })
    }
  }
}

function winCheck(g) {
  const alive = [false, false]
  each(g, (e) => {
    if (e.kind === 'building' && e.proto.kind === 'townhall' && !e.dead) alive[e.owner] = true
  })
  if (!alive[1]) g.over = 'win'
  else if (!alive[0]) g.over = 'loss'
}

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

export function tryPlaceBuilding(g, owner, protoId, x, z, builder) {
  const proto = BUILDINGS[protoId]
  if (!canAfford(g, owner, proto.cost)) return { ok: false, reason: 'Not enough resources' }

  let geyserId = null
  if (proto.kind === 'extractor') {
    const gey = findNearest(g, { x, z }, (e) => e.kind === 'resource' && e.rtype === 'geyser' && !e.extractorId, 3.5)
    if (!gey) return { ok: false, reason: 'Must be placed on a free Citrus Geyser' }
    x = gey.x; z = gey.z; geyserId = gey.id
  } else {
    // spacing check
    let blocked = false
    each(g, (e) => {
      if (blocked || e.kind === 'resource') return
      if (e.kind === 'building' && dist(e, { x, z }) < e.proto.radius + proto.radius + 0.8) blocked = true
    })
    let onGeyser = false
    each(g, (e) => { if (e.kind === 'resource' && e.rtype === 'geyser' && dist(e, { x, z }) < proto.radius + 2) onGeyser = true })
    if (blocked || onGeyser) return { ok: false, reason: 'Blocked placement' }
    if (proto.needsPower) {
      let powered = false
      each(g, (e) => {
        if (e.kind === 'building' && e.owner === owner && e.proto.power && !e.constructing && dist(e, { x, z }) <= 24) powered = true
      })
      if (!powered) return { ok: false, reason: 'Requires Whisker Pylon power' }
    }
  }

  pay(g, owner, proto.cost)
  const b = spawnBuilding(g, owner, protoId, x, z, false, geyserId)
  if (geyserId) g.entities.get(geyserId).extractorId = b.id
  if (builder) builder.order = { type: 'build', siteId: b.id }
  return { ok: true, building: b }
}

export function tryQueueUnit(g, b, protoId) {
  const proto = UNITS[protoId]
  if (b.constructing) return { ok: false, reason: 'Under construction' }
  if (b.queue.length >= 5) return { ok: false, reason: 'Queue full' }
  if (proto.tier >= 2 && !hasTech(g, b.owner)) return { ok: false, reason: 'Requires Tech structure' }
  if (!canAfford(g, b.owner, proto.cost)) return { ok: false, reason: 'Not enough resources' }
  const sup = supplyOf(g, b.owner)
  if (sup.used + proto.cost.supply > sup.max) return { ok: false, reason: 'Supply blocked — build more supply' }
  pay(g, b.owner, proto.cost)
  b.queue.push({ protoId, started: false, t: 0 })
  return { ok: true }
}

// ---- AI ----------------------------------------------------------------------

function aiThink(g, dt) {
  const owner = 1
  const p = g.players[owner]
  const ai = p.ai
  ai.t -= dt
  if (ai.t > 0) return
  ai.t = 1.5

  const facs = p.faction
  const th = findAI(g, owner, (e) => e.proto?.kind === 'townhall')
  if (!th) return

  const workers = listAI(g, owner, (e) => e.kind === 'unit' && e.proto.worker)
  const army = listAI(g, owner, (e) => e.kind === 'unit' && !e.proto.worker)
  const prod = findAI(g, owner, (e) => e.kind === 'building' && e.proto.kind === 'production' && !e.constructing)
  const anyProd = findAI(g, owner, (e) => e.kind === 'building' && e.proto.kind === 'production')
  const tech = findAI(g, owner, (e) => e.kind === 'building' && e.proto.kind === 'tech')
  const extractor = findAI(g, owner, (e) => e.kind === 'building' && e.proto.kind === 'extractor')
  const sup = supplyOf(g, owner)
  const menu = aiMenu(facs)

  // train workers
  if (workers.length < 11 && th.queue.length === 0 && sup.used < sup.max) {
    tryQueueUnit(g, th, aiWorkerProto(facs))
  }

  // supply
  if (sup.max - sup.used < 4 && sup.max < 60) {
    const pending = findAI(g, owner, (e) => e.kind === 'building' && e.proto.supply && e.constructing)
    if (!pending) aiBuild(g, owner, menu.supply, th, workers)
  }

  // pallas: ensure pylon before production
  const isPallas = facs === 'pallas'
  const pylon = findAI(g, owner, (e) => e.kind === 'building' && e.proto.power && !e.constructing)

  // production building
  if (!anyProd && (!isPallas || pylon)) aiBuild(g, owner, menu.production, th, workers)

  // extractor at ~90s
  if (!extractor && g.time > 90) {
    const gey = findNearest(g, th, (e) => e.kind === 'resource' && e.rtype === 'geyser' && !e.extractorId, 25)
    if (gey && workers[0]) {
      const r = tryPlaceBuilding(g, owner, menu.extractor, gey.x, gey.z, workers[0])
      if (r.ok) workers[0].order = { type: 'build', siteId: r.building.id }
    }
  }
  // keep ~3 on zest
  if (extractor && !extractor.constructing) {
    const onZest = workers.filter((w) => w.order.type === 'gather' && w.order.nodeId === extractor.id)
    if (onZest.length < 3) {
      const w = workers.find((w2) => w2.order.type === 'gather' && w2.order.nodeId !== extractor.id)
      if (w) w.order = { type: 'gather', nodeId: extractor.id }
    }
  }

  // tech at ~4 min
  if (!tech && g.time > 240 && (!isPallas || pylon)) aiBuild(g, owner, menu.tech, th, workers)

  // army production
  if (prod && prod.queue.length < 2) {
    const t2ok = !!tech && !tech.constructing
    const roll = Math.random()
    let pick = menu.t1
    if (t2ok && roll > 0.55) pick = menu.t2
    if (t2ok && roll > 0.85 && g.time > 420) pick = menu.t3
    tryQueueUnit(g, prod, pick)
  }

  // attack waves (first one no earlier than ~4 minutes)
  if (!ai.attacking && g.time > 240 && army.length * 1.5 >= ai.wave) {
    ai.attacking = true
    const targetTH = findEnemyTH(g)
    if (targetTH) cmdMove(g, army, targetTH.x, targetTH.z, true)
    g.events.push({ type: 'wave', size: army.length })
  }
  if (ai.attacking) {
    const still = army.filter((u) => u.order.type !== 'idle')
    if (still.length === 0) { ai.attacking = false; ai.wave += 6 }
  }
}

function aiMenu(faction) {
  if (faction === 'republic') return { supply: 'boiler_totem', production: 'grease_garage', tech: 'percolator', extractor: 'juicing_rig', t1: 'citrus_slinger', t2: 'melon_mortar', t3: 'guava_goliath' }
  if (faction === 'panda') return { supply: 'raccoon_pile', production: 'dumpster_den', tech: 'compost_codex', extractor: 'sticky_still', t1: 'scavenger', t2: 'cart_glider', t3: 'dumpster_titan' }
  return { supply: 'whisker_pylon', production: 'warp_alcove', tech: 'halo_archive', extractor: 'zest_chalice', t1: 'looming_disciple', t2: 'nebula_stalker', t3: 'cosmic_floof' }
}

function aiWorkerProto(faction) {
  return faction === 'republic' ? 'hydro_greaser' : faction === 'panda' ? 'junkyard_salvager' : 'astral_levator'
}

function aiBuild(g, owner, protoId, th, workers) {
  const w = workers.find((x) => x.order.type === 'gather' || x.order.type === 'idle')
  if (!w) return
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = Math.random() * Math.PI * 2
    const r = 6 + Math.random() * 9
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

function findEnemyTH(g) {
  let f = null
  each(g, (e) => { if (!f && e.owner === 0 && e.kind === 'building' && e.proto.kind === 'townhall') f = e })
  if (!f) each(g, (e) => { if (!f && e.owner === 0) f = e })
  return f
}
