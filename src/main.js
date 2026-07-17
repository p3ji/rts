import { createGame } from './state.js'
import { tick, checksum, scheduleAt } from './sim.js'
import { Renderer, loadAssets, generatePortraits } from './render.js'
import { Input } from './input.js'
import { UI, homeScreen, showLoading } from './ui.js'
import { DIFFICULTY } from './data.js'
import { audio } from './audio.js'

const FIXED_DT = 1 / 30
// Commands execute 0.5s after being issued. This gives LAN/Wi-Fi packets room to
// arrive before their execution tick without freezing the simulation every time a
// heartbeat is a little late.
const ONLINE_INPUT_DELAY = 15
const CHECKSUM_INTERVAL = 30
const NET_REPORT_INTERVAL = 3000

let assetsReady = false

homeScreen(async (opts) => {
  showLoading(true, 0)
  if (!assetsReady) {
    await loadAssets((f) => showLoading(true, f * 0.9))
    generatePortraits()
    assetsReady = true
  }
  showLoading(true, 1)
  // Timers still run when a tab is backgrounded; requestAnimationFrame may not.
  setTimeout(() => {
    showLoading(false)
    if (opts.mode === 'online') startOnline(opts)
    else start(opts)
  }, 0)
})

function start(opts) {
  const game = createGame(opts)
  const { renderer, input, ui } = wireGame(game)
  ui.toast(`${opts.aiCount} rival kingdom${opts.aiCount > 1 ? 's' : ''} - ${DIFFICULTY[opts.difficulty].name} - destroy every enemy Town Center`)

  let ended = false
  let simLast = performance.now()
  setInterval(() => {
    if (game.paused) { simLast = performance.now(); return }
    const now = performance.now()
    let acc = Math.min(0.25, (now - simLast) / 1000)
    simLast = now
    while (acc >= FIXED_DT) {
      tick(game, FIXED_DT)
      acc -= FIXED_DT
    }
    simLast -= acc * 1000
    if (game.over && !ended) { ended = true; ui.showEnd(game.over) }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

// ---- online LAN party (2-4 players): buffered delayed-command simulation --------
//
// Every peer runs the same deterministic simulation. A player command is tagged for
// execution 15 ticks in the future. This is intentionally *not* a strict per-tick
// heartbeat gate: that design freezes every player whenever Wi-Fi has a transient
// delayed packet. The 500ms command buffer absorbs normal LAN jitter while each
// client keeps its simulation and rendering fluid. Checksums still detect a real
// late-command desync instead of hiding it.
function startOnline(opts) {
  const { net, seed, slot, mapSettings, playerCount } = opts
  const game = createGame({ humanCount: playerCount, aiCount: 0, difficulty: 'normal', seed, mapSettings })
  game.localPlayer = slot
  game.inputDelay = ONLINE_INPUT_DELAY
  game.isOnline = true

  let relayLost = false
  let desynced = false
  const localChecksums = new Map()
  const net$ = { lateCommands: 0, maxLateTicks: 0, ticksProcessed: 0, windowStart: performance.now() }

  game.onCommand = (execTick, cmd) => net.sendCommand(execTick, cmd)

  const { renderer, input, ui } = wireGame(game)

  net.onMessage = (msg) => {
    if (msg.type === 'cmd') {
      for (const cmd of msg.cmds) scheduleAt(game, msg.tick, cmd)
      if (msg.cmds.length && msg.tick <= game.tick) {
        const lateBy = game.tick - msg.tick + 1
        net$.lateCommands++
        net$.maxLateTicks = Math.max(net$.maxLateTicks, lateBy)
      }
    } else if (msg.type === 'checksum') {
      const mine = localChecksums.get(msg.tick)
      if (mine !== undefined && mine !== msg.hash && !desynced) {
        desynced = true
        ui.toast('Desync detected - simulations have diverged. Please restart the match.', true)
      }
    } else if (msg.type === 'peer_left') {
      // One rival dropping doesn't end the match for everyone else — they just
      // stop sending commands, same as an AFK player; the sim keeps going.
      ui.toast(`${game.players[msg.slot]?.name ?? 'A rival'} disconnected.`, true)
    }
  }
  net.onClose = () => {
    if (relayLost) return
    relayLost = true
    ui.toast('Connection to the relay was lost.', true)
  }

  const others = game.players.map((p, i) => i).filter((i) => i !== slot).map((i) => game.players[i].name)
  ui.toast(`Online match vs ${others.join(', ')} - commands have a 0.5s network buffer`)
  window.__net = { get tick() { return game.tick }, stats: net$ }

  let ended = false
  let simLast = performance.now()
  setInterval(() => {
    if (relayLost || desynced) return
    const now = performance.now()
    let acc = Math.min(0.25, (now - simLast) / 1000)
    simLast = now

    while (acc >= FIXED_DT) {
      tick(game, FIXED_DT)
      net$.ticksProcessed++
      if (game.tick % CHECKSUM_INTERVAL === 0) {
        const h = checksum(game)
        localChecksums.set(game.tick, h)
        if (localChecksums.size > 600) {
          for (const k of localChecksums.keys()) {
            if (k < game.tick - 600) localChecksums.delete(k)
            else break
          }
        }
        net.sendChecksum(game.tick, h)
      }
      acc -= FIXED_DT
    }
    simLast -= acc * 1000

    const windowMs = now - net$.windowStart
    if (windowMs >= NET_REPORT_INTERVAL) {
      const expectedTicks = Math.round(windowMs / (1000 * FIXED_DT))
      console.log(`[net] tick=${game.tick} | ticks ${net$.ticksProcessed}/${expectedTicks} expected | late commands ${net$.lateCommands} (worst ${net$.maxLateTicks} ticks)`)
      if (net$.lateCommands) ui.toast(`Network delay exceeded the 0.5s buffer (${net$.lateCommands} late action${net$.lateCommands > 1 ? 's' : ''}).`, true)
      net$.lateCommands = 0
      net$.maxLateTicks = 0
      net$.ticksProcessed = 0
      net$.windowStart = now
    }

    if (game.over && !ended) { ended = true; ui.showEnd(game.over) }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

function wireGame(game) {
  const canvas = document.getElementById('game')
  const renderer = new Renderer(canvas, game)
  let input
  const ui = new UI(game, renderer, () => input)
  input = new Input(game, renderer, ui)

  window.__game = game
  window.__ff = (seconds) => { for (let i = 0; i < seconds * 30; i++) tick(game, FIXED_DT) }
  window.__frame = () => { input.update(FIXED_DT); renderer.sync(); ui.update(input.selected); renderer.render(); return 'frame ok' }
  window.__checksum = () => checksum(game)
  window.__dbg = { input, ui, renderer }
  ui.refresh([])
  audio.startMusic()

  return { renderer, input, ui }
}

function runRenderLoop(game, renderer, input, ui) {
  let last = performance.now()
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    input.update(dt)
    renderer.sync()
    ui.update(input.selected)
    renderer.render()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
