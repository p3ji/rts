// All sound is synthesized with the Web Audio API — no external audio files.
// A single shared AudioContext, unlocked on the first user gesture (autoplay
// policies keep it suspended until then).

const PREF_KEY = 'wobbleton-audio-prefs'
function loadPrefs() {
  try { return { muted: false, sfx: 0.8, music: 0.35, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } }
  catch { return { muted: false, sfx: 0.8, music: 0.35 } }
}
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

class AudioEngine {
  constructor() {
    this.ctx = null
    this.prefs = loadPrefs()
    this._noiseBuffer = null
    this._musicTimer = null
    this._musicOn = false
    const unlock = () => { this.ensure(); if (this.ctx?.state === 'suspended') this.ctx.resume() }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }

  ensure() {
    if (this.ctx) return this.ctx
    const Ctx = window.AudioContext || window.webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.prefs.muted ? 0 : 1
    this.master.connect(this.ctx.destination)
    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this.prefs.sfx
    this.sfxGain.connect(this.master)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.prefs.music
    this.musicGain.connect(this.master)
    return this.ctx
  }

  get muted() { return this.prefs.muted }
  setMuted(m) {
    this.prefs.muted = m
    savePrefs(this.prefs)
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05)
  }
  toggleMuted() { this.setMuted(!this.prefs.muted); return this.prefs.muted }

  get sfxVolume() { return this.prefs.sfx }
  get musicVolume() { return this.prefs.music }
  setSfxVolume(v) {
    this.prefs.sfx = v
    savePrefs(this.prefs)
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }
  setMusicVolume(v) {
    this.prefs.music = v
    savePrefs(this.prefs)
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  noiseBuffer() {
    if (this._noiseBuffer) return this._noiseBuffer
    const ctx = this.ensure()
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    this._noiseBuffer = buf
    return buf
  }

  noise(dest, dur, filterFreq, filterType = 'bandpass', q = 1) {
    const ctx = this.ensure()
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer()
    const filt = ctx.createBiquadFilter()
    filt.type = filterType
    filt.frequency.value = filterFreq
    filt.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(filt); filt.connect(g); g.connect(dest)
    src.start()
    src.stop(ctx.currentTime + dur + 0.05)
    return g
  }

  tone(dest, freq, dur, type = 'sine') {
    const ctx = this.ensure()
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = 0
    osc.connect(g); g.connect(dest)
    osc.start()
    osc.stop(ctx.currentTime + dur + 0.05)
    return { osc, g }
  }

  env(g, t0, peak, attack, decay) {
    g.gain.cancelScheduledValues(t0)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
  }

  // ---- one-shot sfx ------------------------------------------------------------

  sword() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const g = this.noise(this.sfxGain, 0.12, 3200, 'bandpass', 2.2)
    this.env(g, t0, 0.5, 0.002, 0.1)
    for (const f of [1800, 2600]) {
      const { g: tg } = this.tone(this.sfxGain, f, 0.12, 'square')
      this.env(tg, t0, 0.18, 0.002, 0.09)
    }
  }

  bow() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { osc, g } = this.tone(this.sfxGain, 900, 0.16, 'triangle')
    osc.frequency.setValueAtTime(900, t0)
    osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.15)
    this.env(g, t0, 0.35, 0.001, 0.15)
    const ng = this.noise(this.sfxGain, 0.1, 4500, 'highpass', 0.6)
    this.env(ng, t0, 0.12, 0.001, 0.08)
  }

  siege() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { osc, g } = this.tone(this.sfxGain, 150, 0.32, 'sine')
    osc.frequency.setValueAtTime(150, t0)
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.3)
    this.env(g, t0, 0.6, 0.005, 0.32)
    const ng = this.noise(this.sfxGain, 0.2, 300, 'lowpass', 0.9)
    this.env(ng, t0, 0.4, 0.005, 0.2)
  }

  chop() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { g } = this.tone(this.sfxGain, 180, 0.09, 'triangle')
    this.env(g, t0, 0.4, 0.001, 0.08)
    const ng = this.noise(this.sfxGain, 0.06, 1200, 'bandpass', 1.5)
    this.env(ng, t0, 0.25, 0.001, 0.05)
  }

  mine() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    for (const f of [1900, 2850]) {
      const { g } = this.tone(this.sfxGain, f, 0.14, 'sine')
      this.env(g, t0, 0.22, 0.001, 0.13)
    }
    const ng = this.noise(this.sfxGain, 0.05, 5000, 'highpass', 0.8)
    this.env(ng, t0, 0.15, 0.001, 0.04)
  }

  death(big) {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { osc, g } = this.tone(this.sfxGain, big ? 130 : 220, big ? 0.4 : 0.18, 'sine')
    osc.frequency.exponentialRampToValueAtTime(big ? 45 : 90, t0 + (big ? 0.38 : 0.16))
    this.env(g, t0, big ? 0.45 : 0.22, 0.004, big ? 0.4 : 0.17)
    const ng = this.noise(this.sfxGain, big ? 0.3 : 0.12, big ? 500 : 1400, 'lowpass', 0.7)
    this.env(ng, t0, big ? 0.35 : 0.15, 0.004, big ? 0.28 : 0.1)
  }

  buildComplete() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    ;[523.25, 659.25, 783.99].forEach((f, i) => {
      const { g } = this.tone(this.sfxGain, f, 0.22, 'triangle')
      this.env(g, t0 + i * 0.07, 0.25, 0.01, 0.2)
    })
  }

  ageUp() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    ;[392.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const { g } = this.tone(this.sfxGain, f, 0.5, 'triangle')
      this.env(g, t0 + i * 0.11, 0.28, 0.02, 0.45)
    })
  }

  alarm() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    ;[0, 0.22, 0.44].forEach((dt) => {
      const { g } = this.tone(this.sfxGain, 740, 0.16, 'square')
      this.env(g, t0 + dt, 0.18, 0.005, 0.14)
      const { g: g2 } = this.tone(this.sfxGain, 520, 0.16, 'square')
      this.env(g2, t0 + dt + 0.11, 0.18, 0.005, 0.14)
    })
  }

  click() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { g } = this.tone(this.sfxGain, 700, 0.05, 'sine')
    this.env(g, t0, 0.2, 0.001, 0.045)
  }

  error() {
    const ctx = this.ensure(); const t0 = ctx.currentTime
    const { osc, g } = this.tone(this.sfxGain, 220, 0.14, 'square')
    osc.frequency.exponentialRampToValueAtTime(130, t0 + 0.13)
    this.env(g, t0, 0.16, 0.001, 0.13)
  }

  // ---- ambient background music -------------------------------------------------
  // A slow modal chord pad (D Dorian) with occasional plucked sparkle notes,
  // scheduled a bar ahead of playback so timing stays sample-accurate.

  startMusic() {
    if (this._musicOn) return
    this._musicOn = true
    const ctx = this.ensure()
    const CHORDS = [
      [146.83, 174.61, 220.00],  // Dm
      [130.81, 174.61, 220.00],  // C(add9-ish)
      [174.61, 220.00, 261.63],  // F
      [196.00, 246.94, 293.66],  // Gm
    ]
    const SPARKLE = [587.33, 659.25, 698.46, 783.99, 880.00]
    const BAR = 6.5
    let nextTime = ctx.currentTime + 0.1
    let chordI = 0

    const scheduleChord = (t) => {
      const chord = CHORDS[chordI % CHORDS.length]
      chordI++
      for (const f of chord) {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = f
        const g = ctx.createGain()
        g.gain.value = 0
        osc.connect(g); g.connect(this.musicGain)
        osc.start(t)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.5, t + BAR * 0.35)
        g.gain.linearRampToValueAtTime(0.5, t + BAR * 0.65)
        g.gain.linearRampToValueAtTime(0, t + BAR)
        osc.stop(t + BAR + 0.1)
      }
      // sparse plucked sparkle notes, timing/pitch varied for texture (audio flavor only)
      const sparkleCount = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < sparkleCount; i++) {
        const st = t + Math.random() * BAR
        const f = SPARKLE[Math.floor(Math.random() * SPARKLE.length)]
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = f
        const g = ctx.createGain()
        g.gain.value = 0
        osc.connect(g); g.connect(this.musicGain)
        osc.start(st)
        g.gain.setValueAtTime(0, st)
        g.gain.linearRampToValueAtTime(0.12, st + 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, st + 1.2)
        osc.stop(st + 1.3)
      }
    }

    const pump = () => {
      if (!this._musicOn) return
      while (nextTime < ctx.currentTime + BAR * 2) { scheduleChord(nextTime); nextTime += BAR }
      this._musicTimer = setTimeout(pump, BAR * 500)
    }
    pump()
  }

  stopMusic() {
    this._musicOn = false
    if (this._musicTimer) clearTimeout(this._musicTimer)
    this._musicTimer = null
  }
}

export const audio = new AudioEngine()
