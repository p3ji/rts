import { BUILDINGS } from './data.js'
import { each, dist } from './state.js'
import { cmdMove, cmdAttack, cmdGather, cmdRepair, tryPlaceBuilding, checkPlacement } from './sim.js'

export class Input {
  constructor(game, renderer, ui) {
    this.game = game
    this.r = renderer
    this.ui = ui
    this.selected = []
    this.attackModifier = false
    this.placing = null // { protoId, valid }
    this.drag = null // {x0,y0,x1,y1}
    this.keys = new Set()

    const el = renderer.renderer.domElement
    el.addEventListener('mousedown', (e) => this.onDown(e))
    window.addEventListener('mousemove', (e) => this.onMove(e))
    window.addEventListener('mouseup', (e) => this.onUp(e))
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    el.addEventListener('wheel', (e) => {
      this.r.camDist = Math.max(26, Math.min(110, this.r.camDist + e.deltaY * 0.04))
      this.r.updateCamera()
    }, { passive: true })
    window.addEventListener('keydown', (e) => this.onKey(e, true))
    window.addEventListener('keyup', (e) => this.onKey(e, false))
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  nxy(e) {
    return { x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1 }
  }

  onKey(e, down) {
    if (e.repeat) return
    const k = e.key.toLowerCase()
    if (down) this.keys.add(k); else this.keys.delete(k)
    if (!down) return
    if (k === 'a') this.attackModifier = true
    if (k === 'escape') { this.stopPlacing(); this.attackModifier = false; this.ui.refresh(this.selected) }
    if (k === ' ') {
      // jump camera to base
      let th = null
      each(this.game, (x) => { if (!th && x.owner === 0 && x.kind === 'building' && x.proto.kind === 'townhall') th = x })
      if (th) { this.r.camTarget.set(th.x, 0, th.z); this.r.updateCamera() }
      e.preventDefault()
    }
  }

  startPlacing(protoId) {
    this.placing = { protoId }
    this.r.setGhost(protoId)
    this.updateGhost()
  }

  stopPlacing() {
    this.placing = null
    this.r.clearGhost()
  }

  updateGhost() {
    if (!this.placing) return
    const n = { x: (this.mouse.x / window.innerWidth) * 2 - 1, y: -(this.mouse.y / window.innerHeight) * 2 + 1 }
    const pt = this.r.screenToGround(n.x, n.y)
    if (!pt) return
    const chk = checkPlacement(this.game, 0, this.placing.protoId, pt.x, pt.z)
    this.r.moveGhost(chk.x ?? pt.x, chk.z ?? pt.z, chk.ok)
  }

  onDown(e) {
    if (e.target !== this.r.renderer.domElement) return
    const n = this.nxy(e)
    if (e.button === 0) {
      if (this.placing) { this.confirmPlace(n); return }
      if (this.attackModifier) {
        const pt = this.r.screenToGround(n.x, n.y)
        const units = this.selected.filter((u) => u.kind === 'unit' && !u.dead)
        if (units.length) cmdMove(this.game, units, pt.x, pt.z, true)
        this.attackModifier = false
        return
      }
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false }
    } else if (e.button === 2) {
      if (this.placing) { this.stopPlacing(); this.ui.refresh(this.selected); return }
      this.rightCommand(n)
    } else if (e.button === 1) {
      this.pan = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }

  onMove(e) {
    this.mouse = { x: e.clientX, y: e.clientY }
    if (this.placing) this.updateGhost()
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY
      if (Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 6) this.drag.moved = true
      this.ui.drawDragBox(this.drag)
    }
    if (this.pan) {
      const dx = e.clientX - this.pan.x, dy = e.clientY - this.pan.y
      this.pan = { x: e.clientX, y: e.clientY }
      const s = this.r.camDist / 500
      this.r.camTarget.x -= dx * s
      this.r.camTarget.z -= dy * s
      this.clampCam()
      this.r.updateCamera()
    }
  }

  onUp(e) {
    if (e.button === 1) { this.pan = null; return }
    if (e.button !== 0 || !this.drag) return
    const d = this.drag
    this.drag = null
    this.ui.drawDragBox(null)
    if (d.moved) this.boxSelect(d, e.shiftKey)
    else this.clickSelect(this.nxy(e), e.shiftKey)
  }

  clickSelect(n, additive) {
    const ent = this.r.pickEntity(n.x, n.y)
    if (!additive) this.clearSelection()
    if (ent && ent.kind !== 'resource' && ent.owner === 0) {
      ent.selected = true
      if (!this.selected.includes(ent)) this.selected.push(ent)
    }
    this.ui.refresh(this.selected)
  }

  boxSelect(d, additive) {
    if (!additive) this.clearSelection()
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1)
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1)
    const picked = []
    each(this.game, (ent) => {
      if (ent.owner !== 0 || ent.kind !== 'unit') return
      const s = this.r.worldToScreen(ent.x, 1, ent.z)
      if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) picked.push(ent)
    })
    // prefer combat units if mixed selection
    const combat = picked.filter((u) => !u.proto.worker)
    const list = combat.length && picked.length > combat.length ? combat : picked
    for (const u of list) { u.selected = true; if (!this.selected.includes(u)) this.selected.push(u) }
    if (!this.selected.length) {
      // allow single building via box center click fallback: skip
    }
    this.ui.refresh(this.selected)
  }

  clearSelection() {
    each(this.game, (ent) => { ent.selected = false })
    this.selected = []
  }

  rightCommand(n) {
    const units = this.selected.filter((u) => u.kind === 'unit' && !u.dead)
    const buildings = this.selected.filter((u) => u.kind === 'building' && !u.dead)
    const target = this.r.pickEntity(n.x, n.y)
    const pt = this.r.screenToGround(n.x, n.y)

    if (buildings.length && !units.length) {
      for (const b of buildings) b.rally = { x: pt.x, z: pt.z }
      this.ui.toast('Rally point set')
      return
    }
    if (!units.length) return

    if (target && !target.dead) {
      if (target.kind === 'resource') {
        const workers = units.filter((u) => u.proto.worker)
        if (workers.length) { cmdGather(this.game, workers, target); this.ui.toast('Gathering') }
        const rest = units.filter((u) => !u.proto.worker)
        if (rest.length) cmdMove(this.game, rest, target.x, target.z)
        return
      }
      if (target.owner === 0) {
        // friendly: extractor => gather; damaged mech + repair-capable => repair
        if (target.kind === 'building' && target.proto.kind === 'extractor' && !target.constructing) {
          const workers = units.filter((u) => u.proto.worker)
          if (workers.length) { cmdGather(this.game, workers, target); this.ui.toast('Gathering Zest'); return }
        }
        if (target.kind === 'building' && target.constructing) {
          const workers = units.filter((u) => u.proto.worker)
          if (workers.length) { workers.forEach((w) => { w.order = { type: 'build', siteId: target.id } }); this.ui.toast('Resuming construction'); return }
        }
        if (target.hp < target.maxHp) {
          const fixers = units.filter((u) => u.proto.repairs)
          if (fixers.length) { cmdRepair(this.game, fixers, target); this.ui.toast('Repairing'); return }
        }
        cmdMove(this.game, units, target.x, target.z)
        return
      }
      // enemy
      cmdAttack(this.game, units, target)
      return
    }
    cmdMove(this.game, units, pt.x, pt.z)
  }

  confirmPlace(n) {
    const pt = this.r.screenToGround(n.x, n.y)
    const builder = this.selected.find((u) => u.proto?.worker && !u.dead)
    if (!builder) { this.stopPlacing(); return }
    const res = tryPlaceBuilding(this.game, 0, this.placing.protoId, pt.x, pt.z, builder)
    if (res.ok) {
      this.stopPlacing()
      this.ui.toast(`Constructing ${BUILDINGS[res.building.protoId].name}`)
      this.ui.refresh(this.selected)
    } else {
      this.ui.toast(res.reason, true)
    }
  }

  clampCam() {
    const L = 88
    this.r.camTarget.x = Math.max(-L, Math.min(L, this.r.camTarget.x))
    this.r.camTarget.z = Math.max(-L, Math.min(L, this.r.camTarget.z))
  }

  update(dt) {
    // edge scroll + arrows/wasd
    const m = this.mouse
    const edge = 14
    const s = 42 * dt * (this.r.camDist / 60)
    let dx = 0, dz = 0
    if (this.keys.has('arrowleft')) dx -= 1
    if (this.keys.has('arrowright')) dx += 1
    if (this.keys.has('arrowup')) dz -= 1
    if (this.keys.has('arrowdown')) dz += 1
    if (m.x <= edge) dx -= 1
    if (m.x >= window.innerWidth - edge) dx += 1
    if (m.y <= edge) dz -= 1
    if (m.y >= window.innerHeight - edge && m.y < window.innerHeight - 200) dz += 1 // avoid HUD area
    if (dx || dz) {
      this.r.camTarget.x += dx * s
      this.r.camTarget.z += dz * s
      this.clampCam()
      this.r.updateCamera()
    }
    // prune dead from selection
    if (this.selected.some((u) => u.dead)) {
      this.selected = this.selected.filter((u) => !u.dead)
      this.ui.refresh(this.selected)
    }
  }
}
