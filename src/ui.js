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
    this.panelSig = ''
    this.minimap.addEventListener('mousedown', (e) => {
      const rect = this.minimap.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      this.r.camTarget.set((fx - 0.5) * MAP, 0, (fy - 0.5) * MAP)
      this.r.updateCamera()
    })
    this.tooltip = $('tooltip')
  }

  toast(msg, warn = false) {
    const el = $('toast')
    el.textContent = msg
    el.className = warn ? 'warn show' : 'show'
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { el.className = '' }, 2400)
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

  // Tooltip helpers ------------------------------------------------------------

  attachTip(el, html) {
    el.addEventListener('mouseenter', () => {
      this.tooltip.innerHTML = html
      this.tooltip.style.display = 'block'
      const r = el.getBoundingClientRect()
      const tw = this.tooltip.offsetWidth
      let x = r.left + r.width / 2 - tw / 2
      x = Math.max(8, Math.min(window.innerWidth - tw - 8, x))
      this.tooltip.style.left = x + 'px'
      this.tooltip.style.bottom = (window.innerHeight - r.top + 10) + 'px'
    })
    el.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none' })
  }

  costStr(cost) {
    let s = `<span class="c-s">◆ ${cost.s}</span>`
    if (cost.z) s += ` <span class="c-z">🍊 ${cost.z}</span>`
    if (cost.supply) s += ` <span class="c-p">👥 ${cost.supply}</span>`
    return s
  }

  // Selection panel ------------------------------------------------------------

  signature(selected) {
    if (!selected.length) return 'empty'
    const f = selected[0]
    const parts = [selected.map((e) => e.id).join(','), f.constructing ? Math.round(f.progress * 20) : 'x',
      Math.ceil(f.hp / 4), f.maxShield ? Math.ceil(f.shield / 4) : '']
    if (f.queue) parts.push(f.queue.map((q) => q.protoId).join('|'), f.queue[0]?.started ? Math.round(f.queue[0].t) : '')
    parts.push(f.powered === false ? 'unp' : '')
    parts.push(hasTech(this.game, 0) ? 'T' : 't')
    return parts.join('#')
  }

  refresh(selected) {
    this.panelSig = this.signature(selected)
    this.tooltip.style.display = 'none'
    const panel = $('sel-panel')
    const actions = $('actions')
    actions.innerHTML = ''

    if (!selected.length) {
      panel.innerHTML = `<div class="hint">
        <b>Drag-select</b> units &nbsp;·&nbsp; <b>Right-click</b> move / attack / gather / repair
        &nbsp;·&nbsp; <b>A + click</b> attack-move &nbsp;·&nbsp; <b>Space</b> jump to base
        &nbsp;·&nbsp; <b>Esc</b> cancel</div>`
      return
    }

    const first = selected[0]
    const proto = first.proto
    const portrait = PORTRAITS[proto.portrait] || ''
    const counts = {}
    for (const s of selected) counts[s.proto.name] = (counts[s.proto.name] || 0) + 1
    const countStr = Object.entries(counts).map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(', ')

    let statsHtml = ''
    let progressHtml = ''
    if (first.kind === 'unit') {
      statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>` +
        (first.maxShield ? `<span class="stat sh">🛡 ${Math.ceil(first.shield)}/${first.maxShield}</span>` : '') +
        (proto.dmg ? `<span class="stat">⚔ ${proto.dmg}</span>` : '') +
        `<span class="stat role">${proto.role}</span>`
    } else {
      statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>` +
        (first.maxShield ? `<span class="stat sh">🛡 ${Math.ceil(first.shield)}/${first.maxShield}</span>` : '')
      if (first.constructing) {
        statsHtml += `<span class="stat warn">🔨 Under construction</span>`
        progressHtml = `<div class="pbar"><div style="width:${Math.round(first.progress * 100)}%"></div></div>`
      } else if (first.proto.needsPower && !first.powered) {
        statsHtml += `<span class="stat warn">⚡ UNPOWERED — needs a Whisker Pylon</span>`
      }
    }

    // What does this building do? Always show, even while under construction.
    let extra = ''
    if (first.kind === 'building') {
      const bits = []
      if (proto.supply) bits.push(`+${proto.supply} supply`)
      if (proto.trains) bits.push(`Trains: ${proto.trains.map((u) => UNITS[u].name).join(', ')}`)
      if (proto.kind === 'tech') bits.push('Unlocks Tier 2 & Tier 3 units')
      if (proto.kind === 'turret') bits.push(`Auto-attacks (${proto.dmg} dmg, range ${proto.range})`)
      if (proto.kind === 'extractor') bits.push('Workers harvest Zest here')
      if (bits.length) extra = `<div class="sel-extra">${bits.join(' · ')}</div>`
    }

    panel.innerHTML = `
      <img class="portrait" src="${portrait}" alt="">
      <div class="sel-info">
        <div class="sel-name">${countStr}</div>
        <div class="sel-stats">${statsHtml}</div>
        ${progressHtml}
        <div class="sel-desc">${proto.desc || ''}</div>
        ${extra}
      </div>`

    // Action buttons -----------------------------------------------------------
    if (first.kind === 'building' && first.proto.trains) {
      const tech = hasTech(this.game, 0)
      const constructing = first.constructing
      for (const uid of first.proto.trains) {
        const u = UNITS[uid]
        const locked = (u.tier >= 2 && !tech) || constructing
        const lockMsg = constructing ? 'Under construction' : (u.tier >= 2 && !tech) ? 'Requires Tech structure' : ''
        const b = this.actionBtn(PORTRAITS[u.portrait], u.name, this.costStr(u.cost), locked)
        this.attachTip(b, `<b>${u.name}</b> <span class="tip-role">${u.role}</span><br>
          ${this.costStr(u.cost)} · ⏱ ${u.buildTime}s<br>
          <span class="tip-desc">${u.desc}</span>${lockMsg ? `<br><span class="tip-lock">🔒 ${lockMsg}</span>` : ''}`)
        if (!locked) {
          b.onclick = () => {
            const r = tryQueueUnit(this.game, first, uid)
            if (!r.ok) this.toast(r.reason, true)
            this.refresh(selected)
          }
        }
        actions.appendChild(b)
      }
      if (first.queue.length) {
        const q = document.createElement('div')
        q.className = 'queue'
        const cur = first.queue[0]
        const curProto = UNITS[cur.protoId]
        const pct = cur.started ? Math.round((1 - cur.t / curProto.buildTime) * 100) : 0
        q.innerHTML = `<div class="queue-line">Producing: <b>${curProto.name}</b>${cur.started ? '' : ' (waiting for supply)'}</div>
          <div class="pbar"><div style="width:${pct}%"></div></div>
          ${first.queue.length > 1 ? `<div class="queue-line dim">Next: ${first.queue.slice(1).map((i) => UNITS[i.protoId].name).join(' → ')}</div>` : ''}`
        actions.appendChild(q)
      }
    }

    if (first.kind === 'unit' && first.proto.worker) {
      const faction = this.game.players[0].faction
      for (const bid of BUILD_MENU[faction]) {
        const bp = BUILDINGS[bid]
        const b = this.actionBtn(PORTRAITS[bp.portrait], bp.name, this.costStr(bp.cost))
        this.attachTip(b, `<b>${bp.name}</b><br>${this.costStr(bp.cost)} · ⏱ ${bp.buildTime}s<br>
          <span class="tip-desc">${bp.desc}</span>`)
        b.onclick = () => {
          this.getInput().startPlacing(bid)
          this.toast(`Placing ${bp.name} — click ground to build, right-click to cancel`)
        }
        actions.appendChild(b)
      }
    }
  }

  actionBtn(img, name, subHtml, disabled = false) {
    const b = document.createElement('button')
    b.className = 'action' + (disabled ? ' disabled' : '')
    b.innerHTML = `<img src="${img}" alt="" draggable="false"><span>${name}</span><small>${subHtml}</small>`
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
    ctx.fillStyle = '#1c2027'
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
    // rebuild the panel only when its content actually changed (no hover flicker)
    if (this.signature(selected) !== this.panelSig) this.refresh(selected)
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
