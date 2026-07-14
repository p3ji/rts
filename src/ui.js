import { UNITS, BUILDINGS, BUILD_MENU, DIFFICULTY, PLAYER_COLORS, AGE_UP_COST } from './data.js'
import { each, supplyOf, ageOf, hasTemple, canAfford, isVisible, isExplored, MAP } from './state.js'
import { issue } from './sim.js'
import { PORTRAITS } from './render.js'
import { NetClient, defaultRelayUrl } from './net.js'
import { audio } from './audio.js'

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

  signature(selected, inspected) {
    if (!selected.length) return inspected ? `insp:${inspected.id}:${Math.ceil(inspected.amount)}` : 'empty'
    const f = selected[0]
    const p = this.game.players[this.me]
    const parts = [selected.map((e) => e.id).join(','), f.constructing ? Math.round(f.progress * 20) : 'x',
      Math.ceil(f.hp / 4), p.age, f.research ? Math.round(f.research.t) : '']
    if (f.queue) parts.push(f.queue.map((q) => q.protoId).join('|'), f.queue[0]?.started ? Math.round(f.queue[0].t) : '')
    parts.push(hasTemple(this.game, this.me) ? 'T' : 't')
    return parts.join('#')
  }

  refresh(selected, inspected = null) {
    this.panelSig = this.signature(selected, inspected)
    this.tooltip.style.display = 'none'
    this.updateQueueStrip(selected)
    const panel = $('sel-panel')
    const actions = $('actions')
    actions.innerHTML = ''

    if (!selected.length) {
      if (inspected && !inspected.dead) { this.renderResourcePanel(inspected); return }
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
        <div class="sel-stats">${statsHtml}</div>
        ${progressHtml}
        <div class="sel-desc">${proto.desc || ''}</div>
        ${extra}
      </div>`

    // ---- action buttons ----
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
            issue(this.game, { t: 'queue', p: this.me, b: first.id, proto: uid })
          }
        }
        actions.appendChild(b)
      }

      // Age Up on the Town Center
      if (first.proto.kind === 'townhall' && playerAge < 2 && !constructing) {
        const temple = hasTemple(this.game, this.me)
        const busy = !!first.research
        const locked = !temple || busy
        const b = this.actionBtn(PORTRAITS.temple, 'Advance to Age II', this.costStr(AGE_UP_COST), locked)
        b.classList.add('ageup')
        this.attachTip(b, `<b>Advance to Age II</b><br>${this.costStr(AGE_UP_COST)} · ⏱ 45s<br>
          <span class="tip-desc">Upgrades all your buildings to Castle Age style and unlocks Knights, Priests and Catapults.</span>
          ${!temple ? '<br><span class="tip-lock">🔒 Requires a Temple</span>' : ''}`)
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

    if (first.kind === 'unit') {
      // click-a-button, click-a-target order buttons — the same orders right-click and
      // A+click already do, surfaced for anyone who doesn't know those gestures
      const orders = [
        { mode: 'move', icon: '🏃', label: 'Move', desc: 'Click a spot to walk there.' },
        { mode: 'attack', icon: '⚔', label: 'Attack', desc: 'Click an enemy to attack it, or ground to attack-move.' },
        { mode: 'patrol', icon: '🔁', label: 'Patrol', desc: 'Click a spot to patrol back and forth, engaging enemies along the way.' },
      ]
      for (const o of orders) {
        const b = this.orderBtn(o.icon, o.label)
        this.attachTip(b, `<b>${o.label}</b><br><span class="tip-desc">${o.desc}</span>`)
        b.onclick = () => this.getInput().armOrder(o.mode)
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
    const depleted = e.amount <= 0
    const pct = Math.max(0, Math.round((e.amount / e.maxAmount) * 100))
    $('sel-panel').innerHTML = `
      <img class="portrait" src="${portrait}" alt="">
      <div class="sel-info">
        <div class="sel-name">${name}</div>
        <div class="sel-stats">
          <span class="stat">${isWood ? '🪵' : '🪙'} ${depleted ? 'Depleted' : `${Math.ceil(e.amount)} / ${e.maxAmount}`}</span>
        </div>
        <div class="pbar"><div style="width:${pct}%"></div></div>
        <div class="sel-desc">${isWood
          ? 'Send villagers here to chop wood. A depleted forest is left as stumps.'
          : 'Send villagers here to mine gold. The vein is gone once fully mined.'}</div>
      </div>`
  }

  actionBtn(img, name, subHtml, disabled = false) {
    const b = document.createElement('button')
    b.className = 'action' + (disabled ? ' disabled' : '')
    b.innerHTML = `<img src="${img}" alt="" draggable="false"><span>${name}</span><small>${subHtml}</small>`
    if (!disabled) b.addEventListener('click', () => audio.click())
    return b
  }

  // Icon-glyph variant of actionBtn for order-mode buttons (Move/Attack/Patrol)
  // that have no per-item portrait to show.
  orderBtn(icon, name) {
    const b = document.createElement('button')
    b.className = 'action ordbtn'
    b.innerHTML = `<div class="ordicon">${icon}</div><span>${name}</span>`
    b.addEventListener('click', () => audio.click())
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
    for (const o of this.game.obstacles) {
      ctx.fillStyle = '#8a8a88'
      ctx.beginPath()
      ctx.arc((o.x + MAP / 2) * k, (o.z + MAP / 2) * k, o.r * k, 0, 7)
      ctx.fill()
    }
    const g = this.game
    each(g, (e) => {
      // hide fogged entities: enemy units need live sight, everything else once explored
      if (e.owner !== this.me) {
        if (e.kind === 'unit' ? !isVisible(g, e.x, e.z) : !isExplored(g, e.x, e.z)) return
      }
      const x = (e.x + MAP / 2) * k, y = (e.z + MAP / 2) * k
      if (e.kind === 'resource') {
        ctx.fillStyle = e.rtype === 'wood' ? (e.amount > 0 ? '#2e5424' : '#5a5646') : '#e8c447'
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
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
  }

  update(selected) {
    this.updateTop()
    this.drawMinimap()
    this.drainEvents()
    const inspected = selected.length ? null : this.getInput().inspected
    if (this.signature(selected, inspected) !== this.panelSig) this.refresh(selected, inspected)
  }
}

// ---- home / match setup screen ---------------------------------------------------

export function homeScreen(onStart) {
  const el = $('home')
  el.style.display = 'flex'
  let aiCount = 1
  let difficulty = 'normal'

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

  const diffWrap = $('opt-diff')
  diffWrap.innerHTML = ''
  for (const key of Object.keys(DIFFICULTY)) {
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

  $('btn-start').onclick = () => {
    el.style.display = 'none'
    onStart({ mode: 'ai', aiCount, difficulty })
  }

  setupOnlineTab(el, onStart)
}

// ---- online lobby: mode tabs + host/join flow --------------------------------

function setupOnlineTab(homeEl, onStart) {
  const tabAi = $('tab-ai'), tabOnline = $('tab-online')
  const cardAi = $('card-ai'), cardOnline = $('card-online')
  const choice = $('online-choice'), joinForm = $('join-form'), status = $('lobby-status')
  const relayInput = $('online-relay')
  relayInput.value = defaultRelayUrl()

  tabAi.onclick = () => {
    tabAi.classList.add('sel'); tabOnline.classList.remove('sel')
    cardAi.style.display = ''; cardOnline.style.display = 'none'
  }
  tabOnline.onclick = () => {
    tabOnline.classList.add('sel'); tabAi.classList.remove('sel')
    cardAi.style.display = 'none'; cardOnline.style.display = ''
  }

  let net = null
  const showChoice = () => {
    net?.close(); net = null
    choice.style.display = ''; joinForm.style.display = 'none'; status.classList.remove('show')
    $('lobby-code').style.display = 'none'
  }
  const showStatus = (msg) => {
    choice.style.display = 'none'; joinForm.style.display = 'none'
    status.classList.add('show')
    $('lobby-msg').textContent = msg
  }

  $('btn-lobby-cancel').onclick = showChoice
  $('btn-join').onclick = () => { choice.style.display = 'none'; joinForm.style.display = ''; $('join-code').focus() }

  $('btn-host').onclick = () => {
    showStatus('Connecting to relay…')
    net = new NetClient(relayInput.value.trim())
    net.connect().then(() => {
      net.host()
      net.onMessage = (msg) => {
        if (msg.type === 'hosted') {
          $('lobby-code').textContent = msg.code
          $('lobby-code').style.display = ''
          showStatus('Share this code — waiting for your rival to join…')
        } else if (msg.type === 'start') {
          homeEl.style.display = 'none'
          onStart({ mode: 'online', net, seed: msg.seed, slot: msg.slot })
        }
      }
      net.onClose = () => showStatus('Connection lost. Try again.')
    }).catch(() => showStatus('Could not reach the relay server. Check the address and that it is running.'))
  }

  $('btn-join-confirm').onclick = () => {
    const code = $('join-code').value.trim().toUpperCase()
    if (code.length !== 4) return
    showStatus('Connecting to relay…')
    net = new NetClient(relayInput.value.trim())
    net.connect().then(() => {
      net.join(code)
      net.onMessage = (msg) => {
        if (msg.type === 'joined') showStatus('Joined — waiting for the match to start…')
        else if (msg.type === 'error') showStatus(msg.reason || 'Could not join that room.')
        else if (msg.type === 'start') {
          homeEl.style.display = 'none'
          onStart({ mode: 'online', net, seed: msg.seed, slot: msg.slot })
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
