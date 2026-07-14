import { BUILDINGS, PLAYER_COLORS } from './data.js'
import { each, canAfford, MAP } from './state.js'
import { issue, checkPlacement } from './sim.js'

const ids = (list) => list.map((u) => u.id)

export class Input {
  constructor(game, renderer, ui) {
    this.game = game
    this.r = renderer
    this.ui = ui
    this.selected = []
    this.inspected = null // a resource node clicked to inspect (read-only, not an actionable selection)
    this.attackModifier = false
    this.placing = null // { protoId, valid }
    this.drag = null // {x0,y0,x1,y1}
    this.keys = new Set()
    this.chatOpen = false

    this.chat = document.getElementById('chatbar')
    this.chatInput = document.getElementById('chatinput')
    this.chatInput.addEventListener('keydown', (e) => this.onChatKey(e))

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
    if (this.chatOpen) return // the chat field owns the keyboard while open
    const k = e.key.toLowerCase()
    if (down) this.keys.add(k); else this.keys.delete(k)
    if (!down) return
    if (k === 'enter') { this.openChat(); e.preventDefault(); return }
    if (k === 'a') this.attackModifier = true
    if (k === 'escape') { this.stopPlacing(); this.attackModifier = false; this.ui.refresh(this.selected) }
    if (k === ' ') {
      // jump camera to base
      let th = null
      each(this.game, (x) => { if (!th && x.owner === this.game.localPlayer && x.kind === 'building' && x.proto.kind === 'townhall') th = x })
      if (th) { this.r.camTarget.set(th.x, 0, th.z); this.r.updateCamera() }
      e.preventDefault()
    }
  }

  // ---- command chat ----
  openChat() {
    this.chatOpen = true
    this.keys.clear()
    this.attackModifier = false
    this.chat.classList.add('open')
    this.chatInput.value = ''
    this.chatInput.focus()
  }

  closeChat() {
    this.chatOpen = false
    this.chat.classList.remove('open')
    this.chatInput.blur()
  }

  onChatKey(e) {
    e.stopPropagation() // don't let game hotkeys fire while typing
    if (e.key === 'Escape') { this.closeChat(); return }
    if (e.key === 'Enter') {
      this.runCommand(this.chatInput.value.trim().toLowerCase())
      this.closeChat()
    }
  }

  runCommand(cmd) {
    if (!cmd) return
    if (cmd === 'fog of war' || cmd === 'fog') {
      const f = this.game.fog
      f.enabled = !f.enabled
      f.dirty = true
      this.ui.toast(f.enabled
        ? '🌫 Fog of war restored'
        : '👁 Fog of war lifted — the whole map is revealed')
    } else {
      this.ui.toast(`Unknown command: "${cmd}"`, true)
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
        if (units.length) {
          issue(this.game, { t: 'move', p: this.game.localPlayer, units: ids(units), x: pt.x, z: pt.z, am: true })
          this.r.orderFx(pt.x, pt.z, 0xe0483a)
        }
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
    if (!this.drag && !this.pan) this.updateCursor(this.nxy(e))
  }

  // Swaps the canvas cursor to hint what a click will do: attack, gather,
  // interact with your own stuff, or place a building (valid/blocked).
  updateCursor(n) {
    const el = this.r.renderer.domElement
    if (this.pan) { el.style.cursor = 'grabbing'; return }
    if (this.placing) {
      const pt = this.r.screenToGround(n.x, n.y)
      const chk = pt && checkPlacement(this.game, this.game.localPlayer, this.placing.protoId, pt.x, pt.z)
      el.style.cursor = chk?.ok ? 'copy' : 'not-allowed'
      return
    }
    if (this.attackModifier) { el.style.cursor = 'crosshair'; return }
    const units = this.selected.filter((u) => u.kind === 'unit' && !u.dead)
    const ent = this.r.pickEntity(n.x, n.y)
    if (!ent) { el.style.cursor = 'default'; return }
    if (ent.kind === 'resource') { el.style.cursor = units.some((u) => u.proto.worker) ? 'pointer' : 'default'; return }
    if (ent.owner !== this.game.localPlayer) { el.style.cursor = units.length ? 'crosshair' : 'default'; return }
    el.style.cursor = 'pointer'
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
    if (ent && ent.kind === 'resource') {
      this.inspected = ent
      ent.selected = true
    } else {
      this.inspected = null
      if (ent && ent.owner === this.game.localPlayer) {
        ent.selected = true
        if (!this.selected.includes(ent)) this.selected.push(ent)
      }
    }
    this.ui.refresh(this.selected, this.inspected)
  }

  boxSelect(d, additive) {
    if (!additive) this.clearSelection()
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1)
    const y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1)
    const picked = []
    each(this.game, (ent) => {
      if (ent.owner !== this.game.localPlayer || ent.kind !== 'unit') return
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
    this.inspected = null
  }

  rightCommand(n) {
    const g = this.game
    const me = g.localPlayer
    const units = this.selected.filter((u) => u.kind === 'unit' && !u.dead)
    const buildings = this.selected.filter((u) => u.kind === 'building' && !u.dead)
    const target = this.r.pickEntity(n.x, n.y)
    const pt = this.r.screenToGround(n.x, n.y)

    const myColor = PLAYER_COLORS[me]

    if (buildings.length && !units.length) {
      for (const b of buildings) issue(g, { t: 'rally', p: me, b: b.id, x: pt.x, z: pt.z })
      this.r.orderFx(pt.x, pt.z, myColor, true)
      this.ui.toast('Rally point set')
      return
    }
    if (!units.length) return

    if (target && !target.dead) {
      if (target.kind === 'resource') {
        const workers = units.filter((u) => u.proto.worker)
        if (workers.length) { issue(g, { t: 'gather', p: me, units: ids(workers), node: target.id }); this.ui.toast('Gathering') }
        const rest = units.filter((u) => !u.proto.worker)
        if (rest.length) issue(g, { t: 'move', p: me, units: ids(rest), x: target.x, z: target.z, am: false })
        this.r.orderFx(target.x, target.z, target.rtype === 'wood' ? 0x4a8f3a : 0xe8c447)
        return
      }
      if (target.owner === me) {
        // friendly: resume construction or repair
        if (target.kind === 'building' && target.constructing) {
          const workers = units.filter((u) => u.proto.worker)
          if (workers.length) { issue(g, { t: 'construct', p: me, units: ids(workers), site: target.id }); this.ui.toast('Resuming construction'); this.r.orderFx(target.x, target.z, myColor); return }
        }
        if (target.hp < target.maxHp) {
          const fixers = units.filter((u) => u.proto.repairs)
          if (fixers.length) { issue(g, { t: 'repair', p: me, units: ids(fixers), target: target.id }); this.ui.toast('Repairing'); this.r.orderFx(target.x, target.z, myColor); return }
        }
        issue(g, { t: 'move', p: me, units: ids(units), x: target.x, z: target.z, am: false })
        this.r.orderFx(target.x, target.z, myColor)
        return
      }
      // enemy
      issue(g, { t: 'attack', p: me, units: ids(units), target: target.id })
      this.r.orderFx(target.x, target.z, 0xe0483a)
      return
    }
    issue(g, { t: 'move', p: me, units: ids(units), x: pt.x, z: pt.z, am: false })
    this.r.orderFx(pt.x, pt.z, myColor)
  }

  confirmPlace(n) {
    const g = this.game
    const me = g.localPlayer
    const pt = this.r.screenToGround(n.x, n.y)
    const builder = this.selected.find((u) => u.proto?.worker && !u.dead)
    if (!builder) { this.stopPlacing(); return }
    const proto = BUILDINGS[this.placing.protoId]
    const chk = checkPlacement(g, me, this.placing.protoId, pt.x, pt.z)
    if (!chk.ok) { this.ui.toast(chk.reason, true); return }
    if (!canAfford(g, me, proto.cost)) { this.ui.toast('Not enough resources', true); return }
    issue(g, { t: 'build', p: me, proto: this.placing.protoId, x: chk.x, z: chk.z, builder: builder.id })
    this.stopPlacing()
    this.ui.toast(`Constructing ${proto.name}`)
    this.ui.refresh(this.selected)
  }

  clampCam() {
    const L = MAP / 2 - 16
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
