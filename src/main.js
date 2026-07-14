import { createGame } from './state.js'
import { tick, checksum, scheduleAt } from './sim.js'
import { Renderer, loadAssets, generatePortraits } from './render.js'
import { Input } from './input.js'
import { UI, homeScreen, showLoading } from './ui.js'
import { DIFFICULTY } from './data.js'
import { audio } from './audio.js'

const FIXED_DT = 1 / 30
const ONLINE_INPUT_DELAY = 6 // ticks (~200ms @ 30Hz) — buffer for the remote peer's command to arrive
const CHECKSUM_INTERVAL = 30 // ticks between desync-check broadcasts

let assetsReady = false

homeScreen(async (opts) => {
  showLoading(true, 0)
  if (!assetsReady) {
    await loadAssets((f) => showLoading(true, f * 0.9))
    generatePortraits()
    assetsReady = true
  }
  showLoading(true, 1)
  // Start on a timer, not requestAnimationFrame: rAF is suspended when the tab
  // is backgrounded, which would otherwise hang the match before it begins.
  setTimeout(() => {
    showLoading(false)
    if (opts.mode === 'online') startOnline(opts)
    else start(opts)
  }, 0)
})

function start(opts) {
  const game = createGame(opts)
  const { renderer, input, ui } = wireGame(game)
  ui.toast(`${opts.aiCount} rival kingdom${opts.aiCount > 1 ? 's' : ''} · ${DIFFICULTY[opts.difficulty].name} · destroy every enemy Town Center`)

  let ended = false

  // Fixed-step simulation on a timer so the game keeps running even when the
  // tab is hidden (rAF is throttled/suspended in background tabs).
  let simLast = performance.now()
  setInterval(() => {
    const now = performance.now()
    let acc = Math.min(0.25, (now - simLast) / 1000)
    simLast = now
    while (acc >= FIXED_DT) {
      tick(game, FIXED_DT)
      acc -= FIXED_DT
    }
    simLast -= acc * 1000 // carry remainder
    if (game.over && !ended) { ended = true; ui.showEnd(game.over) }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

// ---- online 1v1: deterministic lockstep over the WebSocket relay ----------------
//
// Both peers run the identical sim (see sim.js checksum()). Locally-issued commands
// are scheduled `inputDelay` ticks in the future (via issue()) and broadcast to the
// peer tagged with that same exec tick. A client may not simulate tick T until it
// has received the peer's declaration — command or heartbeat — for tick T, which
// keeps the two simulations lockstepped. The first `inputDelay` ticks are exempt
// (nothing could have been issued for them yet) to avoid a bootstrap deadlock.
function startOnline(opts) {
  const { net, seed, slot } = opts
  const game = createGame({ humanCount: 2, aiCount: 0, difficulty: 'normal', seed })
  game.localPlayer = slot
  game.inputDelay = ONLINE_INPUT_DELAY

  let remoteTick = 0
  let peerLeft = false
  let desynced = false
  const localChecksums = new Map()

  game.onCommand = (execTick, cmd) => net.sendCommand(execTick, cmd)

  const { renderer, input, ui } = wireGame(game)

  net.onMessage = (msg) => {
    if (msg.type === 'cmd') {
      for (const cmd of msg.cmds) scheduleAt(game, msg.tick, cmd)
      if (msg.tick > remoteTick) remoteTick = msg.tick
    } else if (msg.type === 'checksum') {
      const mine = localChecksums.get(msg.tick)
      if (mine !== undefined && mine !== msg.hash && !desynced) {
        desynced = true
        ui.toast('⚠ Desync detected — simulations have diverged. Best to restart the match.', true)
      }
    }
  }
  net.onClose = () => {
    if (peerLeft) return
    peerLeft = true
    ui.toast('Your rival disconnected.', true)
  }

  ui.toast(`Online match vs ${game.players[1 - slot].name} · destroy their Town Center to win`)
  window.__net = { get remoteTick() { return remoteTick } }

  let ended = false
  let simLast = performance.now()
  setInterval(() => {
    if (peerLeft || desynced) return
    const now = performance.now()
    let acc = Math.min(0.25, (now - simLast) / 1000)
    simLast = now
    while (acc >= FIXED_DT) {
      const nextTick = game.tick + 1
      // don't outrun the peer's confirmed input, except for the initial delay buffer
      if (nextTick > game.inputDelay && nextTick > remoteTick) break
      tick(game, FIXED_DT)
      net.sendHeartbeat(game.tick + game.inputDelay)
      if (game.tick % CHECKSUM_INTERVAL === 0) {
        const h = checksum(game)
        localChecksums.set(game.tick, h)
        if (localChecksums.size > 600) for (const k of localChecksums.keys()) { if (k < game.tick - 600) localChecksums.delete(k); else break }
        net.sendChecksum(game.tick, h)
      }
      acc -= FIXED_DT
    }
    if (game.over && !ended) { ended = true; ui.showEnd(game.over) }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

// ---- shared setup: renderer/input/ui wiring + debug handles ---------------------

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
    renderer.sync()           // consumes spawn/death/shot events
    ui.update(input.selected) // consumes remaining events, then clears
    renderer.render()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
