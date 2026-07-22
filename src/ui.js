import { UNITS, BUILDINGS, BUILD_MENU, DIFFICULTY, PLAYER_COLORS, PLAYER_NAMES, AGE_UP_COST, RESOURCE_ABUNDANCE } from './data.js'
import { each, supplyOf, ageOf, hasTemple, canAfford, isVisible, isExplored, MAP } from './state.js'
import { issue } from './sim.js'
import { PORTRAITS } from './render.js'
import { NetClient, defaultRelayUrl } from './net.js'
import { audio } from './audio.js'
import { onUserChanged, login, register, logout, getUserStats, currentUser } from './db.js'

const $ = (id) => document.getElementById(id)
const hex = (c) => '#' + c.toString(16).padStart(6, '0')

export class UI {
  get me() { return this.game.localPlayer }

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

    const muteBtn = $('btn-mute')
    muteBtn.textContent = audio.muted ? '🔇' : '🔊'
    muteBtn.onclick = () => { muteBtn.textContent = audio.toggleMuted() ? '🔇' : '🔊' }

    $('btn-army').onclick = () => { audio.click(); this.getInput().selectAllArmy() }

    this.setupSettings()
  }

  // ---- settings modal: pause, volume, fog toggle, quit ---------------------------

  setupSettings() {
    const modal = $('settings-modal')
    const open = () => modal.classList.add('show')
    const close = () => modal.classList.remove('show')
    $('btn-settings').onclick = open
    $('btn-settings-close').onclick = close

    const pauseBtn = $('btn-pause')
    const banner = $('pause-banner')
    pauseBtn.onclick = () => {
      if (this.game.isOnline) {
        this.toast("Pause isn't available in online matches — each player's game keeps running independently.", true)
        return
      }
      this.game.paused = !this.game.paused
      pauseBtn.textContent = this.game.paused ? '▶ Resume' : '⏸ Pause'
      pauseBtn.classList.toggle('on', this.game.paused)
      banner.classList.toggle('show', this.game.paused)
    }

    $('vol-music').value = Math.round(audio.musicVolume * 100)
    $('vol-music').oninput = (e) => audio.setMusicVolume(Number(e.target.value) / 100)
    $('vol-sfx').value = Math.round(audio.sfxVolume * 100)
    $('vol-sfx').oninput = (e) => audio.setSfxVolume(Number(e.target.value) / 100)

    const fogBtn = $('btn-settings-fog')
    const syncFogBtn = () => {
      fogBtn.textContent = this.game.fog.enabled ? 'Enabled' : 'Disabled'
      fogBtn.classList.toggle('on', this.game.fog.enabled)
    }
    syncFogBtn()
    fogBtn.onclick = () => {
      this.game.fog.enabled = !this.game.fog.enabled
      this.game.fog.dirty = true
      syncFogBtn()
    }

    $('btn-quit').onclick = () => {
      if (confirm('Quit this match and return to the main menu?')) location.reload()
    }
  }

  toast(msg, warn = false) {
    const el = $('toast')
    el.textContent = msg
    el.className = warn ? 'warn show' : 'show'
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { el.className = '' }, 2600)
  }

  updateTop() {
    const p = this.game.players[this.me]
    const sup = supplyOf(this.game, this.me)
    $('res-w').textContent = Math.floor(p.w)
    $('res-g').textContent = Math.floor(p.g)
    $('res-sup').textContent = `${sup.used}/${sup.max}`
    $('res-sup').parentElement.classList.toggle('blocked', sup.used >= sup.max)
    const ageEl = $('age-ind')
    if (p.ageUp) ageEl.textContent = `Advancing… ${Math.round((1 - p.ageUp.t / p.ageUp.total) * 100)}%`
    else ageEl.textContent = p.age >= 2 ? 'Age II — Castle Age' : 'Age I — Village Age'
    const t = Math.floor(this.game.time)
    $('clock').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }

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
    let s = ''
    if (cost.w) s += `<span class="c-w">🪵 ${cost.w}</span> `
    if (cost.g) s += `<span class="c-g">🪙 ${cost.g}</span> `
    if (cost.supply) s += `<span class="c-p">👥 ${cost.supply}</span>`
    return s.trim() || '<span class="c-w">free</span>'
  }

  actionSignature(selected, inspected) {
    if (!selected.length) {
      if (!inspected) return 'empty'
      const isCapturing = inspected.kind === 'tower' && inspected.captureProgress > 0
      return `insp:${inspected.id}:${inspected.owner}:${isCapturing ? 'C' : 'c'}`
    }
    const f = selected[0]
    const p = this.game.players[this.me]
    const parts = [
      selected.map((e) => e.id).join(','),
      f.constructing ? 'C' : 'c',
      p.age,
      hasTemple(this.game, this.me) ? 'T' : 't',
      p.ageUp ? 'A' : 'a'
    ]
    return parts.join('#')
  }

  refresh(selected, inspected = null) {
    this.panelSig = this.actionSignature(selected, inspected)
    this.tooltip.style.display = 'none'
    this.updateQueueStrip(selected)
    const panel = $('sel-panel')
    const actions = $('actions')
    actions.innerHTML = ''

    if (!selected.length) {
      if (inspected && !inspected.dead) {
        if (inspected.kind === 'tower') this.renderTowerPanel(inspected)
        else if (inspected.kind === 'treasure') this.renderTreasurePanel(inspected)
        else this.renderResourcePanel(inspected)
        return
      }
      panel.innerHTML = `<div class="hint">
        <b>Drag-select</b> units &nbsp;·&nbsp; <b>Right-click</b> move / attack / gather / repair
        &nbsp;·&nbsp; <b>A + click</b> attack-move &nbsp;·&nbsp; <b>Space</b> jump to base
        &nbsp;·&nbsp; <b>Esc</b> cancel
        <br><b>Ctrl+0-9</b> set a control group &nbsp;·&nbsp; <b>0-9</b> recall it
        &nbsp;·&nbsp; <b>⚔</b> in the top bar selects your whole army</div>`
      return
    }

    const first = selected[0]
    const proto = first.proto
    const portrait = PORTRAITS[first.protoId] || ''
    const counts = {}
    for (const s of selected) counts[s.proto.name] = (counts[s.proto.name] || 0) + 1
    const countStr = Object.entries(counts).map(([n, c]) => c > 1 ? `${n} ×${c}` : n).join(', ')

    let statsHtml = ''
    let progressHtml = ''
    if (first.kind === 'unit') {
      statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>` +
        (proto.dmg ? `<span class="stat">⚔ ${proto.dmg}</span>` : '') +
        `<span class="stat role">${proto.role}</span>`
    } else {
      statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>`
      if (first.constructing) {
        statsHtml += `<span class="stat warn">🔨 Under construction</span>`
        if (first.owner === this.me && !this.game.isReplay) {
          statsHtml += `<button class="ordchip" id="btn-cancel-build" style="margin-left:8px; padding:2px 6px; background:#8a2020; border:1px solid #5a1515; font-size:11px; cursor:pointer;" title="Cancel and refund 100% cost">Cancel</button>`
        }
        progressHtml = `<div class="pbar"><div style="width:${Math.round(first.progress * 100)}%"></div></div>`
      } else if (first.research) {
        statsHtml += `<span class="stat warn">📜 Advancing to Age II</span>`
        progressHtml = `<div class="pbar"><div style="width:${Math.round((1 - first.research.t / first.research.total) * 100)}%"></div></div>`
      }
    }

    let extra = ''
    if (first.kind === 'building') {
      const bits = []
      if (proto.supply) bits.push(`+${proto.supply} supply`)
      if (proto.trains) bits.push(`Trains: ${proto.trains.map((u) => UNITS[u].name).join(', ')}`)
      if (proto.kind === 'turret') bits.push(`Auto-attacks (${proto.dmg} dmg, range ${proto.range})`)
      if (proto.dropoff) bits.push('Resource drop-off')
      if (bits.length) extra = `<div class="sel-extra">${bits.join(' · ')}</div>`
    }

    panel.innerHTML = `
      <img class="portrait" src="${portrait}" alt="">
      <div class="sel-info">
        <div class="sel-name">${countStr}</div>
        <div class="sel-stats" id="sel-stats">${statsHtml}</div>
        <div id="sel-progress">${progressHtml}</div>
        <div class="sel-desc">${proto.desc || ''}</div>
        ${extra}
        ${first.kind === 'unit' ? '<div class="ord-row" id="ord-row"></div>' : ''}
      </div>`

    const btnCancel = $('btn-cancel-build')
    if (btnCancel) {
      btnCancel.onclick = () => {
        audio.click()
        issue(this.game, { t: 'cancelbuild', p: this.me, b: first.id })
      }
    }
    // Move/Attack/Patrol as small always-visible icon buttons beside the portrait,
    // not in the scrollable action grid below — they used to compete for grid space
    // with the build menu (up to 10 items for a worker), forcing a scroll on
    // anything but the tallest screens. This guarantees they're always reachable.
    if (first.kind === 'unit' && !this.game.isReplay) {
      const row = $('ord-row')
      const orders = [
        { mode: 'move', icon: '🏃', label: 'Move', desc: 'Click a spot to walk there.' },
        { mode: 'attack', icon: '⚔', label: 'Attack', desc: 'Click an enemy to attack it, or ground to attack-move.' },
        { mode: 'patrol', icon: '🔁', label: 'Patrol', desc: 'Click a spot to patrol back and forth, engaging enemies along the way.' },
        { mode: 'stop', icon: '🛑', label: 'Stop', desc: 'Stop moving and clear all orders.' },
      ]
      for (const o of orders) {
        const b = document.createElement('button')
        b.className = 'ordchip'
        b.innerHTML = o.icon
        this.attachTip(b, `<b>${o.label}</b><br><span class="tip-desc">${o.desc}</span>`)
        b.onclick = () => {
          audio.click()
          if (o.mode === 'stop') this.getInput().issueStop()
          else this.getInput().armOrder(o.mode)
        }
        row.appendChild(b)
      }

      if (first.protoId === 'sorcerer') {
        const canSummon = first.mana >= (first.proto.summonCost || 100)
        const b = document.createElement('button')
        b.className = 'ordchip' + (canSummon ? '' : ' disabled')
        b.innerHTML = '🗿'
        b.style.background = canSummon ? 'rgba(155, 81, 224, 0.45)' : 'rgba(255,255,255,0.05)'
        b.style.borderColor = canSummon ? '#9b51e0' : 'rgba(255,255,255,0.2)'
        this.attachTip(b, `<b>Summon Golem</b> (100 Mana)<br><span class="tip-desc">Summon a massive temporary stone construct that lasts 10 seconds.</span>${!canSummon ? `<br><span class="tip-lock">💧 Recharging mana (${Math.floor(first.mana)}/100)</span>` : ''}`)
        if (canSummon) {
          b.onclick = () => {
            audio.click()
            issue(this.game, { t: 'summon', p: this.me, casterId: first.id })
            this.toast('Summoned Golem!')
          }
        }
        row.appendChild(b)
      }
    }

    // ---- action buttons ----
    if (this.game.isReplay) return
    const playerAge = ageOf(this.game, this.me)

    if (first.kind === 'building' && first.proto.trains) {
      const constructing = first.constructing
      for (const uid of first.proto.trains) {
        const u = UNITS[uid]
        const locked = (u.age > playerAge) || constructing
        const lockMsg = constructing ? 'Under construction' : (u.age > playerAge) ? 'Requires Age II' : ''
        const b = this.actionBtn(PORTRAITS[uid], u.name, this.costStr(u.cost), locked)
        this.attachTip(b, `<b>${u.name}</b> <span class="tip-role">${u.role}</span><br>
          ${this.costStr(u.cost)} · ⏱ ${u.buildTime}s<br>
          <span class="tip-desc">${u.desc}</span>${lockMsg ? `<br><span class="tip-lock">🔒 ${lockMsg}</span>` : ''}`)
        if (!locked) {
          b.onclick = () => {
            if (!canAfford(this.game, this.me, u.cost)) { this.toast('Not enough resources', true); return }
            const validBuildings = selected.filter((b2) => b2.kind === 'building' && !b2.constructing && b2.protoId === first.protoId)
            let bestBuilding = first
            if (validBuildings.length > 1) {
              let minQ = 999
              for (const b2 of validBuildings) {
                let qLen = b2.queue ? b2.queue.length : 0
                for (const cmds of this.game.commandsByTick.values()) {
                  for (const c of cmds) {
                    if (c.t === 'queue' && c.b === b2.id) qLen++
                  }
                }
                if (qLen < minQ) { minQ = qLen; bestBuilding = b2 }
              }
            }
            issue(this.game, { t: 'queue', p: this.me, b: bestBuilding.id, proto: uid })
          }
        }
        actions.appendChild(b)
      }

      // Age Up on the Town Center
      if (first.proto.kind === 'townhall' && playerAge < 2 && !constructing) {
        const temple = hasTemple(this.game, this.me)
        const p = this.game.players[this.me]
        const busy = !!p?.ageUp
        const locked = !temple || busy
        const b = this.actionBtn(PORTRAITS.temple, 'Advance to Age II', this.costStr(AGE_UP_COST), locked)
        b.classList.add('ageup')
        
        let lockText = ''
        if (!temple) lockText = '<br><span class="tip-lock">🔒 Requires a Temple</span>'
        else if (busy) lockText = '<br><span class="tip-lock">🔒 Already advancing to Age II</span>'

        this.attachTip(b, `<b>Advance to Age II</b><br>${this.costStr(AGE_UP_COST)} · ⏱ 45s<br>
          <span class="tip-desc">Upgrades all your buildings to Castle Age style and unlocks Knights, Priests and Catapults.</span>
          ${lockText}`)
        if (!locked) {
          b.onclick = () => {
            if (!canAfford(this.game, this.me, AGE_UP_COST)) { this.toast('Not enough resources', true); return }
            issue(this.game, { t: 'ageup', p: this.me, tc: first.id })
            this.toast('Advancing to Age II…')
          }
        }
        actions.appendChild(b)
      }
    }

    if (first.kind === 'unit' && first.proto.worker) {
      for (const bid of BUILD_MENU) {
        const bp = BUILDINGS[bid]
        const b = this.actionBtn(PORTRAITS[bid], bp.name, this.costStr(bp.cost))
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

  // Pinned above the HUD (not inside the fixed-height sel-panel) so it's never
  // clipped regardless of how much other selection info is showing.
  updateQueueStrip(selected) {
    const first = selected[0]
    const strip = $('queue-strip')
    if (first && first.kind === 'building' && first.queue?.length) {
      strip.classList.add('show')
      $('qchips-row').innerHTML = this.queueChipsHtml(first)
    } else {
      strip.classList.remove('show')
      $('qchips-row').innerHTML = ''
    }
  }

  // Compact icon+count chips for a building's production queue.
  queueChipsHtml(b) {
    const groups = []
    for (const q of b.queue) {
      const last = groups[groups.length - 1]
      if (last && last.protoId === q.protoId) last.count++
      else groups.push({ protoId: q.protoId, count: 1 })
    }
    const cur = b.queue[0]
    const curProto = UNITS[cur.protoId]
    const pct = cur.started ? Math.round((1 - cur.t / curProto.buildTime) * 100) : 0
    const chips = groups.map((grp, i) => {
      const proto = UNITS[grp.protoId]
      const isCur = i === 0
      const waiting = isCur && !cur.started
      const title = `${proto.name}${grp.count > 1 ? ` ×${grp.count}` : ''}${waiting ? ' — waiting for supply' : ''}`
      return `<div class="qchip${isCur ? ' cur' : ''}${waiting ? ' waiting' : ''}" title="${title}">
        <img src="${PORTRAITS[grp.protoId]}" alt="">
        ${grp.count > 1 ? `<span class="qcount">${grp.count}</span>` : ''}
        ${isCur ? `<div class="qprog" style="width:${pct}%"></div>` : ''}
      </div>`
    }).join('')
    return chips
  }

  // Read-only info panel for a clicked resource node (not an actionable selection).
  renderResourcePanel(e) {
    const isWood = e.rtype === 'wood'
    const name = isWood ? 'Forest' : 'Gold Deposit'
    const portrait = PORTRAITS[e.rtype] || ''
    const infinite = !isFinite(e.maxAmount)
    const depleted = e.amount <= 0
    const pct = infinite ? 100 : Math.max(0, Math.round((e.amount / e.maxAmount) * 100))
    const amountStr = infinite ? '∞' : depleted ? 'Depleted' : `${Math.ceil(e.amount)} / ${e.maxAmount}`
    $('sel-panel').innerHTML = `
      <img class="portrait" src="${portrait}" alt="">
      <div class="sel-info">
        <div class="sel-name">${name}</div>
        <div class="sel-stats" id="sel-stats">
          <span class="stat">${isWood ? '🪵' : '🪙'} ${amountStr}</span>
        </div>
        <div id="sel-progress"><div class="pbar"><div style="width:${pct}%"></div></div></div>
        <div class="sel-desc">${isWood
          ? 'Send villagers here to chop wood. A depleted forest is left as stumps.'
          : 'Send villagers here to mine gold. The vein is gone once fully mined.'}</div>
      </div>`
  }

  // Read-only info panel for a neutral watchtower.
  renderTowerPanel(e) {
    const owned = e.owner >= 0
    const ownerName = owned ? this.game.players[e.owner].name : 'Unclaimed'
    const capturing = e.captureProgress > 0
    const capPct = capturing ? Math.round((e.captureProgress / e.proto.captureTime) * 100) : 0
    $('sel-panel').innerHTML = `
      <img class="portrait" src="${PORTRAITS.watchtower || ''}" alt="">
      <div class="sel-info">
        <div class="sel-name">${e.proto.name}</div>
        <div class="sel-stats" id="sel-stats">
          <span class="stat">❤ ${Math.ceil(e.hp)}/${e.maxHp}</span>
          <span class="stat" style="${owned ? `color:${hex(PLAYER_COLORS[e.owner])}` : ''}">${owned ? '🚩' : '⚪'} ${ownerName}</span>
          ${owned ? `<span class="stat">🪙 +${e.proto.goldPerSec}/s</span>` : ''}
        </div>
        <div id="sel-progress">${capturing ? `<div class="pbar"><div style="width:${capPct}%"></div></div><div class="sel-stats"><span class="stat warn">Capturing… ${capPct}%</span></div>` : ''}</div>
        <div class="sel-desc">${e.proto.desc}</div>
      </div>`
  }

  // Read-only info panel for a treasure chest.
  renderTreasurePanel(e) {
    $('sel-panel').innerHTML = `
      <img class="portrait" src="${PORTRAITS.treasure || ''}" alt="">
      <div class="sel-info">
        <div class="sel-name">${e.proto.name}</div>
        <div class="sel-stats"><span class="stat">🪙 ${e.gold} gold</span></div>
        <div class="sel-desc">${e.proto.desc}</div>
      </div>`
  }

  actionBtn(img, name, subHtml, disabled = false) {
    const b = document.createElement('button')
    b.className = 'action' + (disabled ? ' disabled' : '')
    b.innerHTML = `<img src="${img}" alt="" draggable="false"><span>${name}</span><small>${subHtml}</small>`
    if (!disabled) b.addEventListener('click', () => audio.click())
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
    ctx.fillStyle = '#4a6b3d'
    ctx.fillRect(0, 0, S, S)
    const k = S / MAP
    const g = this.game
    for (const o of g.obstacles) {
      if (g.fog?.enabled && !isExplored(g, o.x, o.z)) continue
      ctx.fillStyle = '#8a8a88'
      ctx.beginPath()
      ctx.arc((o.x + MAP / 2) * k, (o.z + MAP / 2) * k, o.r * k, 0, 7)
      ctx.fill()
    }
    each(g, (e) => {
      // hide fogged entities: enemy units need live sight, everything else once explored
      if (e.owner !== this.me) {
        if (e.kind === 'unit' ? !isVisible(g, e.x, e.z) : !isExplored(g, e.x, e.z)) return
      }
      const x = (e.x + MAP / 2) * k, y = (e.z + MAP / 2) * k
      if (e.kind === 'resource') {
        ctx.fillStyle = e.rtype === 'wood' ? (e.amount > 0 ? '#2e5424' : '#5a5646') : '#e8c447'
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
      } else if (e.kind === 'treasure') {
        ctx.fillStyle = '#f0c04a'
        ctx.fillRect(x - 2, y - 2, 4, 4)
      } else if (e.kind === 'tower') {
        ctx.fillStyle = e.owner >= 0 ? hex(PLAYER_COLORS[e.owner]) : '#9a9184'
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill()
      } else {
        ctx.fillStyle = hex(PLAYER_COLORS[e.owner])
        const s = e.kind === 'building' ? 5 : 2.5
        ctx.fillRect(x - s / 2, y - s / 2, s, s)
      }
    })
    // shroud overlay (fog canvas is grid-aligned to the map: col=gx, row=gz)
    if (g.fog?.enabled && this.r.fogCanvas) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(this.r.fogCanvas, 0, 0, S, S)
    }
    const t = this.r.camTarget
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    const vw = this.r.camDist * 1.1 * k, vh = this.r.camDist * 0.75 * k
    ctx.strokeRect((t.x + MAP / 2) * k - vw / 2, (t.z + MAP / 2) * k - vh / 2, vw, vh)
  }

  drainEvents() {
    for (const ev of this.game.events) {
      if (ev.type === 'wave' && ev.target === this.me) { this.toast(`⚠ ${this.game.players[ev.owner].name} is attacking! (${ev.size} units)`, true); audio.alarm() }
      if (ev.type === 'ageup') {
        this.toast(ev.owner === this.me ? '🏰 You have advanced to Age II!' : `${this.game.players[ev.owner].name} has advanced to Age II`, ev.owner !== this.me)
      }
      if (ev.type === 'eliminated') {
        if (ev.owner !== this.me) this.toast(`☠ ${this.game.players[ev.owner].name} has been eliminated!`)
      }
      if (ev.type === 'complete' && ev.owner === this.me) {
        const e = this.game.entities.get(ev.id)
        if (e) { this.toast(`${e.proto.name} complete`); audio.buildComplete() }
      }
      if (ev.type === 'cmdfail' && ev.owner === this.me) { this.toast(ev.reason, true); audio.error() }
    }
    this.game.events.length = 0
  }

  showEnd(result) {
    const el = $('endscreen')
    el.style.display = 'flex'
    $('endtitle').textContent = result === 'win' ? 'VICTORY' : 'DEFEAT'
    $('endtitle').className = result
    $('endsub').textContent = result === 'win'
      ? 'Every rival Town Center lies in ruins. The realm is yours.'
      : 'Your Town Center has fallen. The kingdom is lost.'
      
    $('btn-save-replay').onclick = () => {
      const data = JSON.stringify({
        version: 1,
        setupArgs: this.game.setupArgs,
        localPlayer: this.game.localPlayer,
        log: this.game.replayLog
      })
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wobbleton_replay_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  update(selected) {
    this.updateTop()
    this.drawMinimap()
    this.drainEvents()
    const inspected = selected.length ? null : this.getInput().inspected
    const actionSig = this.actionSignature(selected, inspected)
    if (actionSig !== this.panelSig) {
      this.refresh(selected, inspected)
    } else {
      this.updateDynamicValues(selected, inspected)
    }
  }

  updateDynamicValues(selected, inspected) {
    if (!selected.length) {
      if (inspected && !inspected.dead) {
        if (inspected.kind === 'resource') {
          const statsEl = $('sel-stats')
          const pbarEl = $('sel-progress')
          if (statsEl && pbarEl) {
            const isWood = inspected.rtype === 'wood'
            const infinite = !isFinite(inspected.maxAmount)
            const depleted = inspected.amount <= 0
            const amountStr = infinite ? '∞' : depleted ? 'Depleted' : `${Math.ceil(inspected.amount)} / ${inspected.maxAmount}`
            statsEl.innerHTML = `<span class="stat">${isWood ? '🪵' : '🪙'} ${amountStr}</span>`
            const pct = infinite ? 100 : Math.max(0, Math.round((inspected.amount / inspected.maxAmount) * 100))
            pbarEl.innerHTML = `<div class="pbar"><div style="width:${pct}%"></div></div>`
          }
        } else if (inspected.kind === 'tower') {
          const statsEl = $('sel-stats')
          if (statsEl) {
            const owned = inspected.owner >= 0
            const ownerName = owned ? this.game.players[inspected.owner].name : 'Unclaimed'
            statsEl.innerHTML = `
              <span class="stat">❤ ${Math.ceil(inspected.hp)}/${inspected.maxHp}</span>
              <span class="stat" style="${owned ? `color:${hex(PLAYER_COLORS[inspected.owner])}` : ''}">${owned ? '🚩' : '⚪'} ${ownerName}</span>
              ${owned ? `<span class="stat">🪙 +${inspected.proto.goldPerSec}/s</span>` : ''}
            `
          }
          const pbarEl = $('sel-progress')
          if (pbarEl) {
            const capturing = inspected.captureProgress > 0
            const capPct = capturing ? Math.round((inspected.captureProgress / inspected.proto.captureTime) * 100) : 0
            pbarEl.innerHTML = capturing ? `<div class="pbar"><div style="width:${capPct}%"></div></div><div class="sel-stats"><span class="stat warn">Capturing… ${capPct}%</span></div>` : ''
          }
        }
      }
      return
    }

    const first = selected[0]
    const proto = first.proto

    const statsEl = $('sel-stats')
    if (statsEl) {
      let statsHtml = ''
      if (first.kind === 'unit') {
        statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>` +
          (first.maxMana ? `<span class="stat" style="color:#56ccf2;">💧 ${Math.floor(first.mana)}/${first.maxMana}</span>` : '') +
          (first.ttl ? `<span class="stat warn">⏱ ${Math.ceil(first.ttl)}s</span>` : '') +
          (proto.dmg ? `<span class="stat">⚔ ${proto.dmg}</span>` : '') +
          `<span class="stat role">${proto.role}</span>`
      } else {
        statsHtml = `<span class="stat">❤ ${Math.ceil(first.hp)}/${first.maxHp}</span>`
        if (first.constructing) {
          statsHtml += `<span class="stat warn">🔨 Under construction</span>`
        } else if (first.research) {
          statsHtml += `<span class="stat warn">📜 Advancing to Age II</span>`
        }
      }
      statsEl.innerHTML = statsHtml
    }

    const progEl = $('sel-progress')
    if (progEl) {
      let progressHtml = ''
      if (first.kind === 'building') {
        if (first.constructing) {
          progressHtml = `<div class="pbar"><div style="width:${Math.round(first.progress * 100)}%"></div></div>`
        } else if (first.research) {
          progressHtml = `<div class="pbar"><div style="width:${Math.round((1 - first.research.t / first.research.total) * 100)}%"></div></div>`
        }
      } else if (first.kind === 'unit' && first.maxMana > 0) {
        const manaPct = Math.min(100, Math.max(0, Math.round((first.mana / first.maxMana) * 100)))
        progressHtml = `<div class="pbar" title="Mana"><div style="width:${manaPct}%; background:#2f80ed;"></div></div>`
      } else if (first.kind === 'unit' && first.ttl > 0) {
        const ttlPct = Math.min(100, Math.max(0, Math.round((first.ttl / (first.proto.ttl || 10)) * 100)))
        progressHtml = `<div class="pbar" title="Lifespan"><div style="width:${ttlPct}%; background:#e0483a;"></div></div>`
      }
      progEl.innerHTML = progressHtml
    }

    this.updateQueueStrip(selected)
  }
}

// ---- home / match setup screen ---------------------------------------------------

export function homeScreen(onStart) {
  const el = $('home')
  el.style.display = 'flex'
  let aiCount = 1
  let difficulty = 'normal'
  let teamFormat = 'ffa' // 'ffa' | 'teams'

  const aiWrap = $('opt-ai')
  aiWrap.innerHTML = ''
  for (const n of [1, 2, 3]) {
    const b = document.createElement('button')
    b.className = 'opt' + (n === aiCount ? ' sel' : '')
    b.textContent = n === 1 ? '1 rival' : `${n} rivals`
    b.onclick = () => {
      aiCount = n
      aiWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
      b.classList.add('sel')
    }
    aiWrap.appendChild(b)
  }

  const teamFormatWrap = $('opt-team-format')
  if (teamFormatWrap) {
    teamFormatWrap.innerHTML = ''
    const formats = { 'ffa': 'Free for All', 'teams': 'Teams (Red vs Blue)' }
    for (const key of Object.keys(formats)) {
      const b = document.createElement('button')
      b.className = 'opt' + (key === teamFormat ? ' sel' : '')
      b.textContent = formats[key]
      b.onclick = () => {
        teamFormat = key
        teamFormatWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
        b.classList.add('sel')
      }
      teamFormatWrap.appendChild(b)
    }
  }

  const diffWrap = $('opt-diff')
  diffWrap.innerHTML = ''
  for (const key of Object.keys(DIFFICULTY)) {
    if (key === 'globals') continue
    const b = document.createElement('button')
    b.className = 'opt' + (key === difficulty ? ' sel' : '')
    b.textContent = DIFFICULTY[key].name
    b.onclick = () => {
      difficulty = key
      diffWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
      b.classList.add('sel')
    }
    diffWrap.appendChild(b)
  }

  const getMapSettings = setupMapSettings()

  $('btn-start').onclick = () => {
    el.style.display = 'none'
    let teams = null
    if (teamFormat === 'teams') {
      // Slot 0 (Human) on Team 0 (Red), AI rivals on Team 1 (Blue)
      teams = [0, 1, 1, 1]
    }
    onStart({ mode: 'ai', aiCount, difficulty, mapSettings: getMapSettings(), teams })
  }

  setupOnlineTab(el, onStart, getMapSettings)
}

// ---- map settings: resource abundance + neutral feature toggles --------------
// Shared by both Vs AI and Online-host — the online joiner receives whatever
// the host chose via the 'start' message instead of picking their own.

function setupMapSettings() {
  const toggle = $('btn-map-toggle')
  const body = $('map-settings-body')
  const chevron = $('map-toggle-chevron')
  toggle.onclick = () => {
    const open = body.classList.toggle('open')
    chevron.textContent = open ? '▴' : '▾'
  }

  let layout = 'noriver'
  const layoutWrap = $('opt-layout')
  if (layoutWrap) {
    layoutWrap.innerHTML = ''
    const layouts = {
      'noriver': 'No River',
      '1bridge': '1 Bridge',
      '3bridge': '3 Bridges'
    }
    for (const key of Object.keys(layouts)) {
      const b = document.createElement('button')
      b.className = 'opt' + (key === layout ? ' sel' : '')
      b.textContent = layouts[key]
      b.onclick = () => {
        layout = key
        layoutWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
        b.classList.add('sel')
      }
      layoutWrap.appendChild(b)
    }
  }

  let abundance = 'normal'
  const abWrap = $('opt-abundance')
  abWrap.innerHTML = ''
  for (const key of Object.keys(RESOURCE_ABUNDANCE)) {
    const b = document.createElement('button')
    b.className = 'opt' + (key === abundance ? ' sel' : '')
    b.textContent = RESOURCE_ABUNDANCE[key].name
    b.onclick = () => {
      abundance = key
      abWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
      b.classList.add('sel')
    }
    abWrap.appendChild(b)
  }

  let towers = true, treasure = true
  const towersBtn = $('opt-towers'), treasureBtn = $('opt-treasure')
  towersBtn.onclick = () => { towers = !towers; towersBtn.classList.toggle('off', !towers) }
  treasureBtn.onclick = () => { treasure = !treasure; treasureBtn.classList.toggle('off', !treasure) }

  return () => ({ layout, resourceAbundance: abundance, towers, treasure })
}

// ---- online lobby: mode tabs + host/join flow --------------------------------

function setupOnlineTab(homeEl, onStart, getMapSettings) {
  const tabAi = $('tab-ai'), tabOnline = $('tab-online'), tabReplay = $('tab-replay')
  const cardAi = $('card-ai'), cardOnline = $('card-online'), cardReplay = $('card-replay')
  const choice = $('online-choice'), joinForm = $('join-form'), status = $('lobby-status')
  const relayInput = $('online-relay')
  relayInput.value = defaultRelayUrl()

  const setTab = (ai, onl, rep) => {
    tabAi.classList.toggle('sel', ai); tabOnline.classList.toggle('sel', onl); tabReplay.classList.toggle('sel', rep)
    cardAi.style.display = ai ? '' : 'none'
    cardOnline.style.display = onl ? '' : 'none'
    cardReplay.style.display = rep ? '' : 'none'
  }

  tabAi.onclick = () => setTab(true, false, false)
  tabOnline.onclick = () => setTab(false, true, false)
  tabReplay.onclick = () => setTab(false, false, true)

  const btnLoadReplay = $('btn-load-replay')
  const fileReplay = $('file-replay')
  btnLoadReplay.onclick = () => fileReplay.click()
  fileReplay.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data.version && data.setupArgs && data.log) {
          $('home').style.display = 'none'
          onStart({ mode: 'replay', replayData: data })
        } else {
          alert('Invalid replay file format.')
        }
      } catch (err) {
        alert('Could not parse replay file.')
      }
    }
    reader.readAsText(file)
  }

  let net = null
  let isHost = false
  let currentTeams = [0, 1, 0, 1] // Slot 0 Red, Slot 1 Blue, Slot 2 Red, Slot 3 Blue

  const showChoice = () => {
    net?.close(); net = null
    choice.style.display = ''; joinForm.style.display = 'none'; status.classList.remove('show')
    $('lobby-code').style.display = 'none'
    $('lobby-players').style.display = 'none'
    $('btn-start-match').style.display = 'none'
    $('lobby-spinner').style.display = ''
  }
  const showStatus = (msg) => {
    choice.style.display = 'none'; joinForm.style.display = 'none'
    status.classList.add('show')
    $('lobby-spinner').style.display = ''
    $('lobby-players').style.display = 'none'
    $('btn-start-match').style.display = 'none'
    $('lobby-msg').textContent = msg
  }
  // Room supports up to 4 players; the host decides when to start (not an
  // auto-start on the 2nd join), so a LAN party can wait for everyone first.
  const showLobby = (slots, teams) => {
    if (Array.isArray(teams)) currentTeams = teams
    $('lobby-spinner').style.display = 'none'
    $('lobby-players').style.display = 'flex'
    $('lobby-players').style.flexDirection = 'column'
    $('lobby-players').style.gap = '8px'

    const totalActive = Math.min(4, slots.length + (isHost ? onlineAiCount : 0))

    $('lobby-players').innerHTML = Array.from({ length: totalActive }, (_, s) => {
      const isConnected = slots.includes(s)
      let name = PLAYER_NAMES[s]
      if (s === 0 && isHost && currentUser) name = currentUser.email.split('@')[0]
      if (!isConnected) name = `${PLAYER_NAMES[s]} (AI)`
      const teamLabel = currentTeams[s] === 0 ? '🔴 Red Team' : '🔵 Blue Team'
      return `
        <div class="slot-chip" style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:12px; padding:6px 12px; border-radius:6px; background:rgba(255,255,255,0.06);">
          <span>${name}${s === 0 ? ' (host)' : ''}</span>
          <button class="opt team-toggle-btn" data-slot="${s}" style="padding:4px 10px; font-size:12px; cursor:pointer;">${teamLabel}</button>
        </div>
      `
    }).join('')

    $('lobby-players').querySelectorAll('.team-toggle-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        const s = parseInt(btn.getAttribute('data-slot'), 10)
        currentTeams[s] = (currentTeams[s] === 0) ? 1 : 0
        if (net) net.setTeams(currentTeams)
        showLobby(slots, currentTeams)
      }
    })

    $('lobby-msg').textContent = isHost
      ? (slots.length < 2 ? 'Share this code — waiting for at least one more player…' : 'Start whenever you\'re ready, or wait for more players (up to 4).')
      : 'Waiting for the host to start the match…'
    const startBtn = $('btn-start-match')
    startBtn.style.display = isHost ? '' : 'none'
    startBtn.disabled = slots.length < 2
  }

  $('btn-lobby-cancel').onclick = showChoice
  $('btn-join').onclick = () => { choice.style.display = 'none'; joinForm.style.display = ''; $('join-code').focus() }
  $('btn-start-match').onclick = () => net?.startMatch()

  let onlineAiCount = 0
  const onlineAiWrap = $('opt-online-ai')
  if (onlineAiWrap) {
    onlineAiWrap.innerHTML = ''
    for (const n of [0, 1, 2, 3]) {
      const b = document.createElement('button')
      b.className = 'opt' + (n === onlineAiCount ? ' sel' : '')
      b.textContent = n === 0 ? 'None' : (n === 1 ? '1 rival' : `${n} rivals`)
      b.onclick = () => {
        onlineAiCount = n
        onlineAiWrap.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel'))
        b.classList.add('sel')
      }
      onlineAiWrap.appendChild(b)
    }
  }

  $('btn-host').onclick = () => {
    isHost = true
    showStatus('Connecting to relay…')
    net = new NetClient(relayInput.value.trim())
    net.connect().then(() => {
      net.host(getMapSettings(), onlineAiCount, currentTeams)
      net.onMessage = (msg) => {
        if (msg.type === 'hosted') {
          $('lobby-code').textContent = msg.code
          $('lobby-code').style.display = ''
        } else if (msg.type === 'lobby') {
          showLobby(msg.slots, msg.teams)
        } else if (msg.type === 'start') {
          homeEl.style.display = 'none'
          onStart({ mode: 'online', net, seed: msg.seed, slot: msg.slot, mapSettings: msg.mapSettings, playerCount: msg.playerCount, aiCount: msg.aiCount, teams: msg.teams || currentTeams })
        }
      }
      net.onClose = () => showStatus('Connection lost. Try again.')
    }).catch(() => showStatus('Could not reach the relay server. Check the address and that it is running.'))
  }

  $('btn-join-confirm').onclick = () => {
    isHost = false
    const code = $('join-code').value.trim().toUpperCase()
    if (code.length !== 4) return
    showStatus('Connecting to relay…')
    net = new NetClient(relayInput.value.trim())
    net.connect().then(() => {
      net.join(code)
      net.onMessage = (msg) => {
        if (msg.type === 'lobby') showLobby(msg.slots, msg.teams)
        else if (msg.type === 'error') showStatus(msg.reason || 'Could not join that room.')
        else if (msg.type === 'start') {
          homeEl.style.display = 'none'
          onStart({ mode: 'online', net, seed: msg.seed, slot: msg.slot, mapSettings: msg.mapSettings, playerCount: msg.playerCount, aiCount: msg.aiCount, teams: msg.teams || currentTeams })
        }
      }
      net.onClose = () => showStatus('Connection lost. Try again.')
    }).catch(() => showStatus('Could not reach the relay server. Check the address and that it is running.'))
  }
  $('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join-confirm').click() })
}

export function showLoading(show, frac = 0) {
  const el = $('loading')
  el.style.display = show ? 'flex' : 'none'
  $('loadbar-fill').style.width = Math.round(frac * 100) + '%'
}

// ---- profile modal: login/register/stats ---------------------------------------

export function initProfileModal() {
  const modal = $('profile-modal')
  const loginView = $('profile-login-view')
  const statsView = $('profile-stats-view')
  const open = () => modal.classList.add('show')
  const close = () => {
    modal.classList.remove('show')
    $('auth-error').style.display = 'none'
  }

  $('btn-profile').onclick = open
  if ($('home-btn-profile')) $('home-btn-profile').onclick = open
  $('btn-profile-close-login').onclick = close
  $('btn-profile-close-stats').onclick = close

  const showError = (msg) => {
    const err = $('auth-error')
    err.textContent = msg
    err.style.display = 'block'
  }

  $('btn-auth-login').onclick = async () => {
    const em = $('auth-email').value, pw = $('auth-password').value
    if (!em || !pw) return showError('Enter email and password')
    const res = await login(em, pw)
    if (!res.ok) showError(res.error)
    else close()
  }
  
  $('btn-auth-register').onclick = async () => {
    const em = $('auth-email').value, pw = $('auth-password').value
    if (!em || !pw) return showError('Enter email and password')
    const res = await register(em, pw)
    if (!res.ok) showError(res.error)
    else close()
  }

  $('btn-auth-logout').onclick = () => {
    logout()
    close()
  }

  onUserChanged(async (user) => {
    if (user) {
      loginView.style.display = 'none'
      statsView.style.display = 'flex'
      $('profile-email').textContent = user.email
      const stats = await getUserStats()
      if (stats) {
        $('profile-wins-online').textContent = stats.winsOnline || 0
        $('profile-losses-online').textContent = stats.lossesOnline || 0
        $('profile-wins-ai').textContent = stats.winsAi || 0
        $('profile-losses-ai').textContent = stats.lossesAi || 0
      }
    } else {
      loginView.style.display = 'flex'
      statsView.style.display = 'none'
    }
  })
}

// Call once on script load
initProfileModal()
