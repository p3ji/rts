import { createGame, serializeGame, applySnapshot } from './state.js'
import { tick, checksum, scheduleRemote } from './sim.js'
import { Renderer, loadAssets, generatePortraits } from './render.js'
import { Input } from './input.js'
import { UI, homeScreen, showLoading } from './ui.js'
import { DIFFICULTY } from './data.js'
import { audio } from './audio.js'
import { recordMatchResult } from './db.js'

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
    else if (opts.mode === 'replay') startReplay(opts.replayData)
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
    try {
      const now = performance.now()
      let acc = Math.min(0.25, (now - simLast) / 1000)
      simLast = now
      while (acc >= FIXED_DT) {
        tick(game, FIXED_DT)
        acc -= FIXED_DT
      }
      simLast -= acc * 1000
      if (game.over && !ended) { ended = true; ui.showEnd(game.over); recordMatchResult(game.over === 'win', 'ai') }
    } catch (err) {
      console.error('[sim] tick error:', err)
      simLast = performance.now() // don't let a huge stale gap pile up on the next firing
    }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

function startReplay(data) {
  const game = createGame(data.setupArgs)
  game.isReplay = true
  game.localPlayer = data.localPlayer || 0
  
  // Pre-load all recorded commands into the timeline
  for (const log of data.log) {
    if (!game.commandsByTick.has(log.tick)) game.commandsByTick.set(log.tick, [])
    game.commandsByTick.get(log.tick).push(...log.cmds)
  }

  const { renderer, input, ui } = wireGame(game)
  ui.toast(`Watching Replay - ${game.players.length} players`)

  let ended = false
  let simLast = performance.now()
  setInterval(() => {
    if (game.paused) { simLast = performance.now(); return }
    try {
      const now = performance.now()
      let acc = Math.min(0.25, (now - simLast) / 1000)
      simLast = now
      while (acc >= FIXED_DT) {
        tick(game, FIXED_DT)
        acc -= FIXED_DT
      }
      simLast -= acc * 1000
      if (game.over && !ended) { ended = true; ui.showEnd(game.over) }
    } catch (err) {
      console.error('[sim] tick error:', err)
      simLast = performance.now()
    }
  }, 1000 * FIXED_DT)

  runRenderLoop(game, renderer, input, ui)
}

// ---- online LAN party (2-4 players): buffered delayed-command simulation --------
//
// Every peer runs the same deterministic simulation (all sim math goes through
// dmath.js, so results are bit-identical on every browser). A player command is
// tagged for execution 15 ticks (~0.5s) in the future, giving packets room to
// arrive before their exec tick; each client free-runs without ever gating on
// peers, so one slow Wi-Fi moment never freezes the match for everybody — the
// strict per-tick lockstep variant did exactly that. Within a tick, commands
// apply in round-robin slot order (see tick() in sim.js) so application order
// can't differ between clients. If something still diverges — a command
// arriving after its exec tick, a dropped packet — checksums catch it and the
// drifted client silently swaps in a snapshot of the host's state instead of
// halting or stuttering the match.
function startOnline(opts) {
  const { net, seed, slot, mapSettings, playerCount, aiCount } = opts
  const game = createGame({ humanCount: playerCount, aiCount: aiCount || 0, difficulty: 'normal', seed, mapSettings })
  game.localPlayer = slot
  game.inputDelay = ONLINE_INPUT_DELAY
  game.isOnline = true

  let relayLost = false
  const localChecksums = new Map()
  const hostChecksums = new Map()
  let resyncRequestedAt = -Infinity
  let resyncCount = 0
  const net$ = { lateCommands: 0, maxLateTicks: 0, ticksProcessed: 0, windowStart: performance.now() }

  const trimOld = (map, before) => { for (const k of map.keys()) { if (k < before) map.delete(k); else break } }

  // Non-hosts treat the host's sim as the authority. On a confirmed mismatch,
  // ask it for a full snapshot — throttled so one bad stretch produces one
  // request, not a request per checksum interval.
  const requestResync = (atTick, mine, theirs) => {
    console.warn(`[net] checksum mismatch at tick ${atTick}: mine=${mine} host=${theirs}`)
    const now = performance.now()
    if (now - resyncRequestedAt < 8000) return
    resyncRequestedAt = now
    console.log('[net] requesting state snapshot from host')
    net.requestState()
  }
  // Host and client reach any given checksum tick at slightly different real
  // times, so compare from both sides: when the host's hash arrives, and when
  // the local sim computes its own.
  const compareWithHost = (atTick) => {
    const mine = localChecksums.get(atTick)
    const hosts = hostChecksums.get(atTick)
    if (mine !== undefined && hosts !== undefined && mine !== hosts) requestResync(atTick, mine, hosts)
  }

  game.onTickEnd = (execTick, cmds) => {
    // Only put real command batches (plus ~1/sec empty keepalives) on the wire.
    // The lockstep version broadcast 30 msgs/sec per client just to prove
    // liveness; the free-running model doesn't need that.
    if (cmds.length || execTick % 30 === 0) net.sendCommand(execTick, cmds)
  }

  const { renderer, input, ui } = wireGame(game)

  net.onMessage = (msg) => {
    if (msg.type === 'cmd') {
      for (const cmd of msg.cmds) scheduleRemote(game, msg.tick, cmd)
      if (msg.cmds.length && msg.tick <= game.tick) {
        const lateBy = game.tick - msg.tick + 1
        net$.lateCommands++
        net$.maxLateTicks = Math.max(net$.maxLateTicks, lateBy)
      }
    } else if (msg.type === 'checksum') {
      if (slot === 0 || msg.from !== 0) return // only the host's hashes matter
      hostChecksums.set(msg.tick, msg.hash)
      if (hostChecksums.size > 600) trimOld(hostChecksums, game.tick - 600)
      compareWithHost(msg.tick)
    } else if (msg.type === 'state_req') {
      if (slot !== 0) return
      console.log(`[net] slot ${msg.from} requested a resync; sending snapshot at tick ${game.tick}`)
      net.sendState(msg.from, serializeGame(game))
    } else if (msg.type === 'state') {
      if (slot === 0) return
      applySnapshot(game, msg.snap)
      localChecksums.clear()
      hostChecksums.clear()
      resyncRequestedAt = -Infinity
      input.remapEntities()
      renderer.rebuildAll()
      resyncCount++
      console.log(`[net] resynced to host state at tick ${msg.snap.tick}`)
      if (resyncCount === 1) ui.toast('Hit a sync blip — quietly re-synced with the host.', true)
    } else if (msg.type === 'peer_left') {
      // One rival dropping doesn't end the match for everyone else — they just
      // stop sending commands, same as an AFK player; the sim keeps going.
      if (game.players[msg.slot]) game.players[msg.slot].disconnected = true
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
  window.__net = { get tick() { return game.tick }, stats: net$, forceResync: () => net.requestState() }

  let ended = false
  let simLast = performance.now()
  setInterval(() => {
    if (relayLost) return
    try {
      const now = performance.now()
      let acc = Math.min(0.25, (now - simLast) / 1000)
      simLast = now

      while (acc >= FIXED_DT) {
        tick(game, FIXED_DT)
        net$.ticksProcessed++
        if (game.tick % CHECKSUM_INTERVAL === 0) {
          const h = checksum(game)
          localChecksums.set(game.tick, h)
          if (localChecksums.size > 600) trimOld(localChecksums, game.tick - 600)
          if (slot === 0) net.sendChecksum(game.tick, h)
          else compareWithHost(game.tick)
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

      if (game.over && !ended) { ended = true; ui.showEnd(game.over); recordMatchResult(game.over === 'win', 'online') }
    } catch (err) {
      console.error('[sim] online tick error:', err)
      simLast = performance.now()
    }
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
  let warnedOnce = false
  function frame(now) {
    // requestAnimationFrame(frame) below only runs if everything above it
    // completes without throwing — an uncaught error anywhere in this chain
    // silently kills rendering forever (no more frames ever get scheduled)
    // while everything else on the page (setInterval sim ticks, click
    // handlers) keeps working fine, since they don't depend on this chain.
    // That "visuals frozen, page still responsive" signature is exactly what
    // got reported from one player's machine — wrapping this so one bad
    // frame can't permanently end the game for them.
    try {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      input.update(dt)
      renderer.sync()
      ui.update(input.selected)
      renderer.render()
    } catch (err) {
      console.error('[render] frame error (rendering will keep retrying):', err)
      if (!warnedOnce) { warnedOnce = true; ui.toast('A rendering error occurred — check the console. Trying to keep going.', true) }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
