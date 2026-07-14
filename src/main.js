import { createGame } from './state.js'
import { tick } from './sim.js'
import { Renderer, loadAssets, generatePortraits } from './render.js'
import { Input } from './input.js'
import { UI, homeScreen, showLoading } from './ui.js'
import { DIFFICULTY } from './data.js'

const FIXED_DT = 1 / 30

let assetsReady = false

homeScreen(async (opts) => {
  showLoading(true, 0)
  if (!assetsReady) {
    await loadAssets((f) => showLoading(true, f * 0.9))
    generatePortraits()
    assetsReady = true
  }
  showLoading(true, 1)
  requestAnimationFrame(() => {
    showLoading(false)
    start(opts)
  })
})

function start(opts) {
  const game = createGame(opts)
  const canvas = document.getElementById('game')
  const renderer = new Renderer(canvas, game)
  let input
  const ui = new UI(game, renderer, () => input)
  input = new Input(game, renderer, ui)

  // debug/testing handles
  window.__game = game
  window.__ff = (seconds) => { for (let i = 0; i < seconds * 30; i++) tick(game, FIXED_DT) }
  window.__frame = () => { input.update(FIXED_DT); renderer.sync(); ui.update(input.selected); renderer.render(); return 'frame ok' }
  window.__dbg = { input, ui, renderer }
  ui.refresh([])
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
