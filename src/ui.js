import { UNITS, BUILDINGS, BUILD_MENU, PORTRAITS, FACTIONS } from './data.js'
import { each, supplyOf, hasTech, MAP } from './state.js'
import { tryQueueUnit } from './sim.js'

const $ = (id) => document.getElementById(id)

export class UI {
  constructor(game, renderer, getInput) {
    this.game = game
    this.r = renderer
    this.getInput = getInput
    this.minimap = $('minimap')
    this.mctx = this.minimap.getContext('2d')
    this.toastT = 0
    this.minimap.addEventListener('mousedown', (e) => {
      const rect = this.minimap.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      this.r.camTarget.set((fx - 0.5) * MAP, 0, (fy - 0.5) * MAP)
      this.r.updateCamera()
    })
  }

  toast(msg, warn = false) {
    const el = $('toast')
    el.textContent = msg
    el.className = warn ? 'warn show' : 'show'
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { el.className = '' }, 2200)
  }

  updateTop() {
    const p = this.game.players[0]
    const sup = supplyOf(this.game, 0)
    $('res-s').textContent = Math.floor(p.s)
    $('res-z').textContent = Math.floor(p.z)
    $('res-sup').textContent = `${sup.used}/${sup.max}`
    $('res-sup').parentElement.classList.toggle('blocked', sup.used >= sup.max)
    const t = Math.floor(this.game.time)
    $('clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }

  refresh(selected) {
    const panel = $('sel-panel')
    const actions = $('actions')
    actions.innerHTML = ''
    if (!selected.length) {
      panel.innerHTML = `<div class="hint">Drag-select units · Right-click to command · A + click = attack-move · Space = your base</div>`
      return
    }
    const first = selected[0]
    const proto = first.proto
    const portrait = PORTRAITS[proto.portrait] || ''
    const counts = {}
    for (const s of selected) counts[s.proto.name] = (counts[s.proto.name] || 0) + 1
    const countStr = Object.entries(counts).map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(', ')

    let stats = ''
    if (first.kind === 'unit') {
      stats = `${Math.ceil(first.hp)}/${first.maxHp} HP` + (first.maxShield ? ` · ${Math.ceil(first.shield)} shield` : '') +
        (proto.dmg ? ` · ${proto.dmg} dmg` : '') + ` · ${proto.role}`
    } else {
      stats = `${Math.ceil(first.hp)}/${first.maxHp} HP` + (first.constructing ? ` · ${Math.round(first.progress * 100)}% built` : '') +
        (first.proto.needsPower && !first.powered ? ' · ⚠ UNPOWERED' : '')
    }

    panel.innerHTML = `
      <img class="portrait" src="${portrait}" alt="">
      <div class="sel-info">
        <div class="sel-name">${countStr}</div>
        <div class="sel-stats">${stats}</div>
        <div class="sel-desc">${proto.desc || ''}</div>
      </div>`

    // Action buttons
    if (first.kind === 'building' && !first.constructing && first.proto.trains) {
      const tech = hasTech(this.game, 0)
      for (const uid of first.proto.trains) {
        const u = UNITS[uid]
        const locked = u.tier >= 2 && !tech
        const b = this.actionBtn(PORTRAITS[u.portrait], u.name,
          `${u.cost.s}◆ ${u.cost.z ? u.cost.z + '🍊 ' : ''}${u.cost.supply} supply${locked ? ' — needs Tech' : ''}`, locked)
        b.onclick = () => {
          const r = tryQueueUnit(this.game, first, uid)
          if (!r.ok) this.toast(r.reason, true)
          this.refresh(selected)
        }
        actions.appendChild(b)
      }
      if (first.queue.length) {
        const q = document.createElement('div')
        q.className = 'queue'
        q.textContent = 'Queue: ' + first.queue.map((i) => UNITS[i.protoId].name).join(' → ')
        actions.appendChild(q)
      }
    }
    if (first.kind === 'unit' && first.proto.worker) {
      const faction = this.game.players[0].faction
      for (const bid of BUILD_MENU[faction]) {
        const bp = BUILDINGS[bid]
        const b = this.actionBtn(PORTRAITS[bp.portrait], bp.name, `${bp.cost.s}◆${bp.cost.z ? ' ' + bp.cost.z + '🍊' : ''}`)
        b.onclick = () => {
          this.getInput().startPlacing(bid)
          this.toast(`Placing ${bp.name} — click ground, right-click to cancel`)
        }
        actions.appendChild(b)
      }
    }
  }

  actionBtn(img, name, sub, disabled = false) {
    const b = document.createElement('button')
    b.className = 'action' + (disabled ? ' disabled' : '')
    b.innerHTML = `<img src="${img}" alt=""><span>${name}</span><small>${sub}</small>`
    return b
  }

  drawDragBox(d) {
    const el = $('dragbox')
    if (!d || !d.moved) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.left = Math.min(d.x0, d.x1) + 'px'
    el.style.top = Math.min(d.y0, d.y1) + 'px'
    el.style.width = Math.abs(d.x1 - d.x0) + 'px'
    el.style.height = Math.abs(d.y1 - d.y0) + 'px'
  }

  drawMinimap() {
    const ctx = this.mctx
    const S = this.minimap.width
    ctx.fillStyle = '#20242b'
    ctx.fillRect(0, 0, S, S)
    const k = S / MAP
    each(this.game, (e) => {
      const x = (e.x + MAP / 2) * k, y = (e.z + MAP / 2) * k
      if (e.kind === 'resource') {
        ctx.fillStyle = e.rtype === 'shiny' ? '#63d3d8' : '#e89a2f'
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
      } else {
        ctx.fillStyle = e.owner === 0 ? '#4dff88' : '#ff5544'
        const s = e.kind === 'building' ? 5 : 2.5
        ctx.fillRect(x - s / 2, y - s / 2, s, s)
      }
    })
    // camera frustum box (approx)
    const t = this.r.camTarget
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    const vw = this.r.camDist * 1.1 * k, vh = this.r.camDist * 0.75 * k
    ctx.strokeRect((t.x + MAP / 2) * k - vw / 2, (t.z + MAP / 2) * k - vh / 2, vw, vh)
  }

  drainEvents() {
    for (const ev of this.game.events) {
      if (ev.type === 'wave') this.toast(`⚠ Enemy attack wave incoming! (${ev.size} units)`, true)
      if (ev.type === 'complete' && ev.owner === 0) {
        const e = this.game.entities.get(ev.id)
        if (e) this.toast(`${e.proto.name} complete`)
      }
    }
    this.game.events.length = 0
  }

  showEnd(result) {
    const el = $('endscreen')
    el.style.display = 'flex'
    $('endtitle').textContent = result === 'win' ? 'VICTORY' : 'DEFEAT'
    $('endtitle').className = result
    $('endsub').textContent = result === 'win'
      ? 'The enemy town hall has been reduced to scenic rubble.'
      : 'Your town hall is gone. The animals are displeased.'
  }

  update(selected) {
    this.updateTop()
    this.drawMinimap()
    this.drainEvents()
    // live-refresh selection panel every ~0.5s
    this._selT = (this._selT || 0) + 1
    if (this._selT % 30 === 0 && selected.length) this.refresh(selected)
  }
}

export function factionPickScreen(onPick) {
  const el = $('factionpick')
  el.style.display = 'flex'
  const grid = $('factiongrid')
  grid.innerHTML = ''
  for (const f of Object.values(FACTIONS)) {
    const card = document.createElement('button')
    card.className = 'fcard'
    const th = BUILDINGS[f.townHall]
    card.innerHTML = `
      <img src="${PORTRAITS[th.portrait]}" alt="">
      <h3>${f.name}</h3>
      <p>${f.blurb}</p>`
    card.onclick = () => { el.style.display = 'none'; onPick(f.id) }
    grid.appendChild(card)
  }
}
