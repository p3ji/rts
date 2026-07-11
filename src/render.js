import * as THREE from 'three'
import { FACTIONS, BUILDINGS } from './data.js'
import { MAP, each } from './state.js'

export class Renderer {
  constructor(canvas, game) {
    this.game = game
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x181e26)
    this.scene.fog = new THREE.Fog(0x181e26, 170, 360)

    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 600)
    this.camTarget = new THREE.Vector3(-MAP / 2 + 22, 0, MAP / 2 - 22)
    this.camDist = 62
    this.updateCamera()

    const sun = new THREE.DirectionalLight(0xffe9c4, 2.9)
    sun.position.set(60, 90, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = 110
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc
    sun.shadow.camera.far = 300
    sun.shadow.bias = -0.0004
    this.sun = sun
    this.scene.add(sun, sun.target)
    this.scene.add(new THREE.HemisphereLight(0x9db4d6, 0x4a3d2e, 1.0))
    const fill = new THREE.DirectionalLight(0x8fb0e0, 0.5)
    fill.position.set(-50, 40, -60)
    this.scene.add(fill)

    this.buildGround()
    this.scatterProps()

    this.meshes = new Map()
    this.effects = []
    this.ghost = null
    this.raycaster = new THREE.Raycaster()
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  updateCamera() {
    const t = this.camTarget
    const d = this.camDist
    this.camera.position.set(t.x, d, t.z + d * 0.62)
    this.camera.lookAt(t.x, 0, t.z)
    if (this.sun) {
      this.sun.position.set(t.x + 60, 90, t.z + 30)
      this.sun.target.position.set(t.x, 0, t.z)
    }
  }

  // ---- environment -----------------------------------------------------------

  buildGround() {
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#71603f'
    ctx.fillRect(0, 0, 1024, 1024)
    // large soft patches
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 1024, y = Math.random() * 1024, r = 60 + Math.random() * 160
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      const tones = ['110,96,66', '124,106,70', '100,86,60', '132,116,82', '96,88,64']
      grad.addColorStop(0, `rgba(${tones[i % tones.length]},0.55)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // speckle
    for (let i = 0; i < 5000; i++) {
      const s = 1 + Math.random() * 4
      ctx.fillStyle = `rgba(${70 + Math.random() * 90 | 0},${60 + Math.random() * 70 | 0},${40 + Math.random() * 50 | 0},${0.1 + Math.random() * 0.25})`
      ctx.beginPath()
      ctx.arc(Math.random() * 1024, Math.random() * 1024, s, 0, 7)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(5, 5)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP, MAP, 32, 32),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.9 })
    const mk = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, h), wallMat)
      m.position.set(x, 1.6, z)
      m.receiveShadow = true
      this.scene.add(m)
    }
    const L = MAP / 2 + 2
    mk(MAP + 8, 4, 0, -L); mk(MAP + 8, 4, 0, L); mk(4, MAP + 8, -L, 0); mk(4, MAP + 8, L, 0)
  }

  scatterProps() {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a746c, roughness: 1 })
    const shrubGeo = new THREE.ConeGeometry(0.7, 1.1, 7)
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x5d7a44, roughness: 1 })
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 6)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 1 })
    const leafGeo = new THREE.SphereGeometry(1.05, 8, 6)
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1 })
    const orangeGeo = new THREE.SphereGeometry(0.13, 6, 5)
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe8862f, emissive: 0x552800, roughness: 0.6 })

    const d = MAP / 2 - 22
    const bases = [[-d, d], [d, -d], [0, 0]]
    const clear = (x, z) => bases.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 24)

    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * (MAP - 10)
      const z = (Math.random() - 0.5) * (MAP - 10)
      if (clear(x, z)) continue
      const roll = Math.random()
      let m
      if (roll < 0.45) {
        m = new THREE.Mesh(rockGeo, rockMat)
        const s = 0.35 + Math.random() * 0.9
        m.scale.set(s, s * (0.6 + Math.random() * 0.5), s)
        m.rotation.y = Math.random() * 7
        m.position.set(x, m.scale.y * 0.45, z)
      } else if (roll < 0.8) {
        m = new THREE.Mesh(shrubGeo, shrubMat)
        const s = 0.6 + Math.random() * 0.8
        m.scale.setScalar(s)
        m.position.set(x, 0.5 * s, z)
      } else {
        m = new THREE.Group()
        const tr = new THREE.Mesh(trunkGeo, trunkMat)
        tr.position.y = 0.5
        m.add(tr)
        const lv = new THREE.Mesh(leafGeo, leafMat)
        lv.position.y = 1.6
        lv.scale.y = 0.85
        m.add(lv)
        for (let k = 0; k < 5; k++) {
          const o = new THREE.Mesh(orangeGeo, orangeMat)
          const a = Math.random() * 7, b = Math.random() * 3
          o.position.set(Math.cos(a) * 0.8, 1.35 + Math.sin(b) * 0.5, Math.sin(a) * 0.8)
          m.add(o)
        }
        m.position.set(x, 0, z)
        const s = 0.8 + Math.random() * 0.7
        m.scale.setScalar(s)
      }
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      this.scene.add(m)
    }
  }

  // ---- material helpers --------------------------------------------------------

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.12, ...opts })
  }

  add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, material)
    m.position.set(x, y, z)
    m.rotation.set(rx, ry, rz)
    parent.add(m)
    return m
  }

  // ---- sync ---------------------------------------------------------------------

  sync() {
    const g = this.game
    for (const ev of g.events) {
      if (ev.type === 'spawn') {
        const e = g.entities.get(ev.id)
        if (e && !this.meshes.has(ev.id)) this.meshes.set(ev.id, this.buildMesh(e))
      } else if (ev.type === 'death' || ev.type === 'depleted') {
        const grp = this.meshes.get(ev.id)
        if (grp) {
          this.scene.remove(grp)
          this.meshes.delete(ev.id)
          if (ev.type === 'death') this.deathFx(ev.x, ev.z, ev.kind)
        }
      } else if (ev.type === 'shot') {
        this.shotFx(ev)
      }
    }

    const t = performance.now() / 1000
    for (const [id, grp] of this.meshes) {
      const e = g.entities.get(id)
      if (!e || e.dead) { this.scene.remove(grp); this.meshes.delete(id); continue }
      // walk bounce for units
      const ud = grp.userData
      if (e.kind === 'unit') {
        const moved = Math.hypot(e.x - (ud.px ?? e.x), e.z - (ud.pz ?? e.z))
        ud.walk = (ud.walk ?? 0) + moved * 2.2
        ud.px = e.x; ud.pz = e.z
        const hop = e.protoIsFloaty ? 0 : Math.abs(Math.sin(ud.walk * 3)) * Math.min(0.16, moved * 60)
        grp.position.set(e.x, hop, e.z)
        grp.rotation.y = -e.rot + Math.PI / 2
      } else {
        grp.position.set(e.x, 0, e.z)
      }
      if (e.kind === 'building' && e.constructing) {
        grp.scale.setScalar(0.55 + 0.45 * e.progress)
      } else if (grp.scale.x !== 1) grp.scale.setScalar(1)

      if (ud.bar) this.updateBar(e, ud)
      if (ud.selRing) {
        ud.selRing.visible = !!e.selected
        if (e.selected) ud.selRing.material.opacity = 0.75 + Math.sin(t * 5) * 0.2
      }
      if (ud.anim) {
        for (const s of ud.anim.spin || []) s.rotation.y += s.userData.spd ?? 0.02
        for (const b of ud.anim.bob || []) b.m.position.y = b.base + Math.sin(t * b.speed + id) * b.amp
        for (const p of ud.anim.pulse || []) p.mat.emissiveIntensity = p.base + Math.sin(t * p.speed + id) * p.amp
      }
      if (ud.unpoweredIcon) ud.unpoweredIcon.visible = e.kind === 'building' && !e.constructing && e.proto.needsPower && !e.powered
    }

    const now = performance.now()
    this.effects = this.effects.filter((fx) => {
      const k = (now - fx.t0) / fx.dur
      if (k >= 1) { this.scene.remove(fx.obj); return false }
      fx.update?.(k)
      return true
    })
  }

  // ---- entity mesh construction ---------------------------------------------------

  buildMesh(e) {
    const grp = new THREE.Group()
    grp.position.set(e.x, 0, e.z)
    grp.userData.anim = { spin: [], bob: [], pulse: [] }
    let body
    if (e.kind === 'resource') body = this.resourceMesh(e, grp.userData.anim)
    else if (e.kind === 'building') body = this.buildingMesh(e.protoId, this.game.players[e.owner].faction, grp.userData.anim)
    else body = this.unitMesh(e, grp.userData.anim)
    grp.add(body)
    grp.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    grp.userData.entityId = e.id
    if (e.kind === 'unit' && this.game.players[e.owner].faction === 'pallas') e.protoIsFloaty = true

    if (e.kind !== 'resource') {
      const rad = (e.proto.radius || 1) + 0.35
      const ringCol = e.owner === 0 ? 0x4dff88 : 0xff5544
      // faint ownership ring (always)
      const own = new THREE.Mesh(
        new THREE.RingGeometry(rad - 0.09, rad, 40),
        new THREE.MeshBasicMaterial({ color: ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.22 })
      )
      own.rotation.x = -Math.PI / 2
      own.position.y = 0.05
      grp.add(own)
      // bright selection ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rad - 0.2, rad + 0.05, 40),
        new THREE.MeshBasicMaterial({ color: ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.07
      ring.visible = false
      grp.add(ring)
      grp.userData.selRing = ring

      const bar = this.makeBar()
      bar.sprite.position.y = this.barHeight(e)
      grp.add(bar.sprite)
      grp.userData.bar = bar
      this.updateBar(e, grp.userData)

      if (e.kind === 'building' && e.proto.needsPower) {
        const icon = this.textSprite('⚡ NO POWER', '#ffd257')
        icon.position.y = this.barHeight(e) + 1.4
        icon.visible = false
        grp.add(icon)
        grp.userData.unpoweredIcon = icon
      }
    }
    this.scene.add(grp)
    return grp
  }

  textSprite(text, color) {
    const c = document.createElement('canvas')
    c.width = 256; c.height = 48
    const ctx = c.getContext('2d')
    ctx.font = 'bold 30px system-ui'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, 256, 48)
    ctx.fillStyle = color
    ctx.fillText(text, 128, 34)
    const tex = new THREE.CanvasTexture(c)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
    s.scale.set(5.4, 1.05, 1)
    return s
  }

  barHeight(e) {
    if (e.kind === 'building') return e.proto.radius * 1.7 + 2.0
    return e.proto.radius * 2 + 1.6
  }

  makeBar() {
    const c = document.createElement('canvas')
    c.width = 96; c.height = 14
    const tex = new THREE.CanvasTexture(c)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
    sprite.scale.set(3.2, 0.48, 1)
    return { canvas: c, tex, sprite }
  }

  updateBar(e, ud) {
    const { canvas, tex, sprite } = ud.bar
    sprite.position.y = this.barHeight(e)
    const full = e.hp >= e.maxHp && (!e.maxShield || e.shield >= e.maxShield) && !e.constructing
    sprite.visible = e.selected || !full
    if (!sprite.visible) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 96, 14)
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, 96, 14)
    if (e.constructing) {
      ctx.fillStyle = '#e8b83a'
      ctx.fillRect(1, 1, Math.round(94 * e.progress), 12)
      tex.needsUpdate = true
      return
    }
    const hpF = Math.max(0, e.hp / e.maxHp)
    ctx.fillStyle = hpF > 0.6 ? '#46d160' : hpF > 0.3 ? '#e8b83a' : '#e0452f'
    ctx.fillRect(1, e.maxShield ? 7 : 1, Math.round(94 * hpF), e.maxShield ? 6 : 12)
    if (e.maxShield) {
      ctx.fillStyle = '#59c1ff'
      ctx.fillRect(1, 1, Math.round(94 * Math.max(0, e.shield / e.maxShield)), 5)
    }
    tex.needsUpdate = true
  }

  // ---- creature part kits ----------------------------------------------------------

  capybara(s = 1) {
    const g = new THREE.Group()
    const fur = this.mat(0xb98d4f, { roughness: 0.95 })
    const dark = this.mat(0x8a6636, { roughness: 0.95 })
    const body = this.add(g, new THREE.CapsuleGeometry(0.34 * s, 0.5 * s, 6, 10), fur, 0, 0.4 * s, 0, Math.PI / 2 * 0.9)
    this.add(g, new THREE.BoxGeometry(0.34 * s, 0.3 * s, 0.42 * s), fur, 0, 0.52 * s, 0.42 * s)
    this.add(g, new THREE.BoxGeometry(0.24 * s, 0.18 * s, 0.16 * s), dark, 0, 0.5 * s, 0.62 * s)
    this.add(g, new THREE.SphereGeometry(0.06 * s, 5, 4), dark, 0.12 * s, 0.68 * s, 0.42 * s)
    this.add(g, new THREE.SphereGeometry(0.06 * s, 5, 4), dark, -0.12 * s, 0.68 * s, 0.42 * s)
    return g
  }

  raccoon(s = 1) {
    const g = new THREE.Group()
    const fur = this.mat(0x8d8496, { roughness: 0.98 })
    const dark = this.mat(0x3a3540, { roughness: 0.98 })
    const light = this.mat(0xcfc9d6, { roughness: 0.98 })
    this.add(g, new THREE.CapsuleGeometry(0.3 * s, 0.34 * s, 6, 10), fur, 0, 0.42 * s, 0, Math.PI / 2 * 0.75)
    const head = this.add(g, new THREE.SphereGeometry(0.24 * s, 10, 8), light, 0, 0.62 * s, 0.3 * s)
    this.add(g, new THREE.BoxGeometry(0.44 * s, 0.12 * s, 0.2 * s), dark, 0, 0.64 * s, 0.42 * s)
    this.add(g, new THREE.ConeGeometry(0.08 * s, 0.14 * s, 4), dark, 0.14 * s, 0.82 * s, 0.26 * s)
    this.add(g, new THREE.ConeGeometry(0.08 * s, 0.14 * s, 4), dark, -0.14 * s, 0.82 * s, 0.26 * s)
    // ringed tail
    for (let i = 0; i < 4; i++) {
      this.add(g, new THREE.CylinderGeometry(0.09 * s * (1 - i * 0.12), 0.11 * s * (1 - i * 0.12), 0.14 * s, 7),
        i % 2 ? dark : fur, 0, 0.34 * s + i * 0.1 * s, -0.42 * s - i * 0.1 * s, -0.9)
    }
    return g
  }

  pallasCat(s = 1) {
    const g = new THREE.Group()
    const fur = this.mat(0x9a9284, { roughness: 1 })
    const cream = this.mat(0xc9c0ac, { roughness: 1 })
    const dark = this.mat(0x4a443c, { roughness: 1 })
    // the roundest possible body
    this.add(g, new THREE.SphereGeometry(0.46 * s, 14, 12), fur, 0, 0.5 * s, 0)
    const head = this.add(g, new THREE.SphereGeometry(0.26 * s, 12, 10), cream, 0, 0.88 * s, 0.2 * s)
    head.scale.y = 0.85
    this.add(g, new THREE.ConeGeometry(0.06 * s, 0.08 * s, 4), dark, 0.16 * s, 1.02 * s, 0.16 * s)
    this.add(g, new THREE.ConeGeometry(0.06 * s, 0.08 * s, 4), dark, -0.16 * s, 1.02 * s, 0.16 * s)
    // judging brow
    this.add(g, new THREE.BoxGeometry(0.3 * s, 0.05 * s, 0.06 * s), dark, 0, 0.94 * s, 0.4 * s)
    // striped tail wrap
    this.add(g, new THREE.TorusGeometry(0.4 * s, 0.09 * s, 8, 18, Math.PI * 1.2), fur, 0, 0.28 * s, 0, Math.PI / 2, 0, 1)
    return g
  }

  goldHalo(r, y, anim) {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.05, 8, 28),
      this.mat(0xd9b64a, { emissive: 0x8a6a10, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 })
    )
    halo.rotation.x = Math.PI / 2
    halo.position.y = y
    halo.userData.spd = 0.03
    anim.spin.push(halo)
    return halo
  }

  crystal(size, opts = {}) {
    return new THREE.Mesh(
      new THREE.OctahedronGeometry(size),
      this.mat(0x9cc4f5, { emissive: 0x2f5fae, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.1, ...opts })
    )
  }

  // ---- units ------------------------------------------------------------------------

  unitMesh(e, anim) {
    const g = new THREE.Group()
    const p = e.proto
    const r = p.radius
    const faction = this.game.players[e.owner].faction

    const steel = this.mat(0x7d838c, { metalness: 0.55, roughness: 0.5 })
    const copper = this.mat(0xa66a3a, { metalness: 0.7, roughness: 0.35 })
    const rust = this.mat(0x74584a, { metalness: 0.4, roughness: 0.8 })
    const tire = this.mat(0x24262b, { roughness: 0.95 })

    if (faction === 'republic') {
      switch (p.tier) {
        case 0: { // Hydro-Greaser: mini excavator with tub
          this.add(g, new THREE.BoxGeometry(r * 1.5, r * 0.55, r * 1.7), rust, 0, r * 0.55, 0)
          this.add(g, new THREE.BoxGeometry(r * 1.7, r * 0.4, r * 0.5), tire, 0, r * 0.25, r * 0.62)
          this.add(g, new THREE.BoxGeometry(r * 1.7, r * 0.4, r * 0.5), tire, 0, r * 0.25, -r * 0.62)
          const tubW = this.add(g, new THREE.BoxGeometry(r * 1.1, r * 0.14, r * 1.1), this.mat(0x63d3d8, { emissive: 0x1f8f96, emissiveIntensity: 0.7, roughness: 0.15 }), 0, r * 0.9, -r * 0.1)
          anim.pulse.push({ mat: tubW.material, base: 0.7, amp: 0.25, speed: 2 })
          const arm1 = this.add(g, new THREE.BoxGeometry(0.16, 0.16, r * 1.3), steel, 0, r * 1.05, r * 0.9, 0.5)
          this.add(g, new THREE.BoxGeometry(r * 0.5, r * 0.3, r * 0.35), steel, 0, r * 0.72, r * 1.5)
          const capy = this.capybara(r * 0.9); capy.position.set(0, r * 0.85, -r * 0.1); g.add(capy)
          break
        }
        case 1: { // Citrus-Slinger: quad with flaming orange basket
          this.add(g, new THREE.BoxGeometry(r * 1.4, r * 0.5, r * 1.9), steel, 0, r * 0.62, 0)
          for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
            const w = this.add(g, new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.26, 12), tire, sx * r * 0.78, r * 0.38, sz * r * 0.68, 0, 0, Math.PI / 2)
          }
          const basket = this.add(g, new THREE.BoxGeometry(r * 0.9, r * 0.4, r * 0.7), copper, 0, r * 1.35, -r * 0.55, -0.25)
          for (let i = 0; i < 3; i++) {
            const o = this.add(g, new THREE.SphereGeometry(0.16, 8, 6),
              this.mat(0xff7a1e, { emissive: 0xcc3d00, emissiveIntensity: 1.4, roughness: 0.4 }),
              (i - 1) * 0.24, r * 1.62, -r * 0.55)
            anim.pulse.push({ mat: o.material, base: 1.4, amp: 0.5, speed: 5 + i })
          }
          this.add(g, new THREE.BoxGeometry(0.14, 0.14, r * 1.2), steel, 0, r * 1.28, r * 0.1, -0.5)
          const capy = this.capybara(r * 0.95); capy.position.set(0, r * 0.82, r * 0.35); g.add(capy)
          break
        }
        case 2: {
          if (p.aura) { // Spa Guardian: rolling hot tub
            const tub = this.add(g, new THREE.CylinderGeometry(r * 0.85, r * 0.75, r * 0.8, 16), rust, 0, r * 0.75, 0)
            this.add(g, new THREE.TorusGeometry(r * 0.85, 0.09, 8, 20), copper, 0, r * 1.15, 0, Math.PI / 2)
            const wat = this.add(g, new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.06, 16),
              this.mat(0x63d3d8, { emissive: 0x1f8f96, emissiveIntensity: 0.9, roughness: 0.1 }), 0, r * 1.12, 0)
            anim.pulse.push({ mat: wat.material, base: 0.9, amp: 0.35, speed: 2.4 })
            for (const sx of [-1, 1]) {
              this.add(g, new THREE.CylinderGeometry(0.09, 0.12, r * 1.1, 8), copper, sx * r * 0.68, r * 1.4, -r * 0.4, 0.35 * sx)
              this.add(g, new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.22, 10), tire, sx * r * 0.8, r * 0.32, 0, 0, 0, Math.PI / 2)
            }
            const capy = this.capybara(r * 0.85); capy.position.set(0, r * 1.1, 0.1); g.add(capy)
          } else { // Melon-Mortar: tracked mortar with melons
            this.add(g, new THREE.BoxGeometry(r * 1.8, r * 0.42, r * 1.5), steel, 0, r * 0.45, 0)
            this.add(g, new THREE.BoxGeometry(r * 2, r * 0.5, r * 0.46), tire, 0, r * 0.3, r * 0.62)
            this.add(g, new THREE.BoxGeometry(r * 2, r * 0.5, r * 0.46), tire, 0, r * 0.3, -r * 0.62)
            this.add(g, new THREE.CylinderGeometry(r * 0.3, r * 0.42, r * 1.9, 12), this.mat(0x9aa1a8, { metalness: 0.7, roughness: 0.35 }), -r * 0.2, r * 1.25, 0, 0, 0, 0.9)
            const gear = this.add(g, new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.12, 12), copper, r * 0.35, r * 0.85, 0, Math.PI / 2, 0, 0)
            gear.userData.spd = 0.01
            anim.spin.push(gear)
            for (let i = 0; i < 3; i++) {
              this.add(g, new THREE.SphereGeometry(0.2, 8, 6), this.mat(0x3f7a35, { roughness: 0.5 }), r * 0.65, r * 0.75 + i * 0.16, -r * 0.45 + i * 0.1)
            }
            const capy = this.capybara(r * 0.8); capy.position.set(r * 0.45, r * 0.66, r * 0.35); g.add(capy)
          }
          break
        }
        default: { // Guava Goliath: dome-cockpit mech
          for (const sx of [-1, 1]) {
            this.add(g, new THREE.BoxGeometry(r * 0.5, r * 1.1, r * 0.7), steel, sx * r * 0.55, r * 0.55, 0)
            this.add(g, new THREE.BoxGeometry(r * 0.62, r * 0.3, r * 0.95), tire, sx * r * 0.55, r * 0.15, 0)
          }
          this.add(g, new THREE.BoxGeometry(r * 1.7, r * 0.75, r * 1.25), rust, 0, r * 1.45, 0)
          const dome = this.add(g, new THREE.SphereGeometry(r * 0.62, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0xa8d8b0, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 }),
            0, r * 2.1, 0)
          const capy = this.capybara(r * 0.55); capy.position.set(0, r * 1.85, 0); g.add(capy)
          for (const sx of [-1, 1]) {
            const gat = new THREE.Group()
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2
              this.add(gat, new THREE.CylinderGeometry(0.09, 0.09, r * 1.1, 6), this.mat(0x4c5157, { metalness: 0.7, roughness: 0.3 }), Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, Math.PI / 2)
            }
            gat.position.set(sx * r * 1.15, r * 1.5, r * 0.45)
            g.add(gat)
            this.add(g, new THREE.SphereGeometry(r * 0.34, 8, 6), copper, sx * r * 1.05, r * 1.85, 0)
          }
          break
        }
      }
    } else if (faction === 'panda') {
      switch (p.tier) {
        case 0: { // Junkyard Salvager: raccoon + sled of cans
          const rc = this.raccoon(r * 1.1); g.add(rc)
          const sled = this.add(g, new THREE.BoxGeometry(r * 0.9, r * 0.5, r * 0.8),
            new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.75 }),
            0, r * 0.35, -r * 1.3)
          const canCols = [0xc23b3b, 0x3b7ac2, 0x4fc23b, 0xc2a63b]
          for (let i = 0; i < 4; i++) {
            this.add(g, new THREE.CylinderGeometry(0.11, 0.11, 0.24, 8), this.mat(canCols[i], { metalness: 0.6, roughness: 0.3 }),
              (i % 2 - 0.5) * 0.3, r * 0.66, -r * 1.3 + (i > 1 ? 0.22 : -0.1))
          }
          break
        }
        case 1: { // Scavenger: spear + wet floor sign
          const rc = this.raccoon(r * 1.15); g.add(rc)
          this.add(g, new THREE.CylinderGeometry(0.045, 0.045, r * 2.4, 6), this.mat(0x8a6a42, { roughness: 0.8 }), r * 0.42, r * 1.1, 0.1, 0, 0, -0.18)
          this.add(g, new THREE.ConeGeometry(0.11, 0.3, 5), steel, r * 0.5, r * 2.3, 0.1)
          const sign = this.add(g, new THREE.BoxGeometry(r * 0.55, r * 0.7, 0.05), this.mat(0xe8c53a, { roughness: 0.5 }), -r * 0.5, r * 0.75, 0.05, 0, 0.4, 0.12)
          break
        }
        case 2: {
          if (p.aura) { // Garbologist: cone hat shaman
            const rc = this.raccoon(r * 1.2); g.add(rc)
            this.add(g, new THREE.ConeGeometry(r * 0.3, r * 0.72, 10), this.mat(0xd97b29, { roughness: 0.6 }), 0, r * 1.35, 0.3 * r)
            this.add(g, new THREE.TorusGeometry(r * 0.19, 0.035, 6, 14), this.mat(0xeeeeee), 0, r * 1.28, 0.3 * r, 0.35)
            const can = this.add(g, new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8), this.mat(0x9aa1a8, { metalness: 0.7 }), r * 0.62, r * 0.62, 0.25)
            const smoke = this.add(g, new THREE.SphereGeometry(0.14, 6, 5),
              new THREE.MeshStandardMaterial({ color: 0xa05ad0, emissive: 0x7a2fb0, emissiveIntensity: 1, transparent: true, opacity: 0.7 }),
              r * 0.62, r * 0.95, 0.25)
            anim.bob.push({ m: smoke, base: r * 0.95, amp: 0.1, speed: 3 })
            anim.pulse.push({ mat: smoke.material, base: 1, amp: 0.5, speed: 3.6 })
            const ring = this.add(g, new THREE.TorusGeometry(r * 1.5, 0.03, 6, 30),
              new THREE.MeshBasicMaterial({ color: 0xa05ad0, transparent: true, opacity: 0.3 }), 0, 0.25, 0, Math.PI / 2)
            ring.userData.spd = 0.02
            anim.spin.push(ring)
          } else { // Shopping Cart Glider
            const cartMat = this.mat(0xb8bec6, { metalness: 0.8, roughness: 0.3 })
            const cart = this.add(g, new THREE.BoxGeometry(r * 0.95, r * 0.62, r * 1.25), cartMat, 0, r * 0.75, r * 0.2)
            cart.material.wireframe = false
            this.add(g, new THREE.BoxGeometry(r * 1.0, 0.06, r * 1.3), cartMat, 0, r * 0.46, r * 0.2)
            for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
              this.add(g, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), tire, sx * r * 0.4, 0.15, r * 0.2 + sz * r * 0.55, 0, 0, Math.PI / 2)
            }
            const rider = this.raccoon(r * 0.85); rider.position.set(0, r * 0.72, r * 0.25); g.add(rider)
            const pusher = this.raccoon(r * 0.95); pusher.position.set(0, 0, -r * 0.95); pusher.rotation.x = -0.25; g.add(pusher)
            const bag = this.add(g, new THREE.SphereGeometry(0.2, 7, 6), this.mat(0x3f4448, { roughness: 0.6 }), r * 0.5, r * 1.5, r * 0.3)
            anim.bob.push({ m: bag, base: r * 1.5, amp: 0.12, speed: 6 })
          }
          break
        }
        default: { // Dumpster Titan
          const rc = this.raccoon(r * 1.5); rc.position.y = r * 0.5; g.add(rc)
          const shell = this.add(g, new THREE.BoxGeometry(r * 1.9, r * 1.1, r * 1.5), this.mat(0x5e6e5a, { metalness: 0.45, roughness: 0.6 }), 0, r * 1.35, -r * 0.15)
          this.add(g, new THREE.BoxGeometry(r * 0.95, r * 0.2, r * 1.5), this.mat(0x4c5a48, { metalness: 0.45 }), -r * 0.5, r * 2.0, -r * 0.15, 0, 0, 0.35)
          this.add(g, new THREE.BoxGeometry(r * 0.95, r * 0.2, r * 1.5), this.mat(0x4c5a48, { metalness: 0.45 }), r * 0.5, r * 2.0, -r * 0.15, 0, 0, -0.35)
          for (let i = 0; i < 4; i++) {
            const drip = this.add(g, new THREE.SphereGeometry(0.12, 6, 5),
              this.mat(0xa05ad0, { emissive: 0x7a2fb0, emissiveIntensity: 0.9 }),
              (i - 1.5) * r * 0.5, r * 0.85, r * 0.62)
            anim.pulse.push({ mat: drip.material, base: 0.9, amp: 0.4, speed: 2 + i })
          }
          break
        }
      }
    } else { // pallas
      const isFloaty = true
      switch (p.tier) {
        case 0: { // Astral Levator
          const cat = this.pallasCat(r * 1.05); cat.position.y = r * 0.55; g.add(cat)
          anim.bob.push({ m: cat, base: r * 0.55, amp: 0.12, speed: 2.2 })
          for (let i = 0; i < 3; i++) {
            const c = this.crystal(0.14)
            c.position.set(Math.cos(i * 2.1) * r * 0.9, r * 1.1, Math.sin(i * 2.1) * r * 0.9)
            g.add(c)
            anim.bob.push({ m: c, base: r * 1.1 + i * 0.2, amp: 0.15, speed: 2.8 + i })
          }
          const disc = this.add(g, new THREE.CylinderGeometry(r * 0.8, r * 0.9, 0.08, 6),
            this.mat(0xbcd7f7, { emissive: 0x4a7ac2, emissiveIntensity: 0.4, transparent: true, opacity: 0.5 }), 0, 0.25, 0)
          break
        }
        case 1: { // Looming Disciple
          const robe = this.add(g, new THREE.ConeGeometry(r * 0.62, r * 1.5, 10), this.mat(0x5a5f9e, { roughness: 0.7 }), 0, r * 0.75, 0)
          const cat = this.pallasCat(r * 0.9); cat.position.y = r * 1.1; g.add(cat)
          this.add(g, new THREE.CylinderGeometry(0.05, 0.05, r * 2.2, 6), this.mat(0x8a6a42), r * 0.55, r * 1.15, 0)
          const tip = this.crystal(0.16)
          tip.position.set(r * 0.55, r * 2.35, 0)
          g.add(tip)
          anim.pulse.push({ mat: tip.material, base: 0.7, amp: 0.4, speed: 3 })
          g.add(this.goldHalo(r * 0.5, r * 2.35, anim))
          break
        }
        case 2: {
          if (p.aura) { // Grand Seer
            const plat = this.add(g, new THREE.CylinderGeometry(r * 0.85, r * 0.95, 0.16, 6),
              this.mat(0xd8e6f7, { emissive: 0x6a90c8, emissiveIntensity: 0.5, roughness: 0.15 }), 0, 0.4, 0)
            const cat = this.pallasCat(r * 1.1); cat.position.y = 0.65; g.add(cat)
            anim.bob.push({ m: cat, base: 0.65, amp: 0.08, speed: 1.8 })
            const bigHalo = this.goldHalo(r * 0.95, r * 1.9, anim)
            bigHalo.rotation.x = Math.PI / 2.4
            g.add(bigHalo)
            anim.pulse.push({ mat: plat.material, base: 0.5, amp: 0.25, speed: 2 })
          } else { // Nebula Stalker
            const hull = this.add(g, new THREE.SphereGeometry(r * 0.55, 12, 10),
              this.mat(0x7f9fd0, { metalness: 0.3, roughness: 0.3 }), 0, r * 1.15, 0)
            const cat = this.pallasCat(r * 0.62); cat.position.y = r * 1.3; g.add(cat)
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2 + Math.PI / 4
              const hip = new THREE.Group()
              hip.position.set(Math.cos(a) * r * 0.55, r * 1.0, Math.sin(a) * r * 0.55)
              const upper = this.add(hip, new THREE.CylinderGeometry(0.07, 0.1, r * 0.9, 6), this.mat(0xaecdf5, { roughness: 0.25, emissive: 0x2f5fae, emissiveIntensity: 0.3 }), Math.cos(a) * r * 0.3, -r * 0.2, Math.sin(a) * r * 0.3, 0, 0, Math.cos(a) * 0.8)
              upper.rotation.x = -Math.sin(a) * 0.8
              this.add(hip, new THREE.ConeGeometry(0.09, r * 0.7, 5), this.mat(0xaecdf5, { roughness: 0.25 }), Math.cos(a) * r * 0.62, -r * 0.75, Math.sin(a) * r * 0.62, Math.PI)
              g.add(hip)
            }
            const gun = this.crystal(0.2)
            gun.position.set(0, r * 1.75, -r * 0.3)
            g.add(gun)
            anim.pulse.push({ mat: gun.material, base: 0.7, amp: 0.4, speed: 4 })
          }
          break
        }
        default: { // Cosmic Floof
          const galaxy = this.add(g, new THREE.SphereGeometry(r * 0.95, 18, 14),
            this.mat(0x2c2f5e, { emissive: 0x4a4ac0, emissiveIntensity: 0.5, roughness: 0.6 }), 0, r * 1.25, 0)
          anim.pulse.push({ mat: galaxy.material, base: 0.5, amp: 0.2, speed: 1.4 })
          const cat = this.pallasCat(r * 0.75); cat.position.set(0, r * 1.7, r * 0.35); g.add(cat)
          anim.bob.push({ m: galaxy, base: r * 1.25, amp: 0.14, speed: 1.6 })
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2
            const limb = this.crystal(0.3)
            limb.position.set(Math.cos(a) * r * 1.1, r * 0.55, Math.sin(a) * r * 1.1)
            limb.scale.y = 2.2
            g.add(limb)
          }
          const shell = this.add(g, new THREE.SphereGeometry(r * 1.25, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0x59c1ff, transparent: true, opacity: 0.1, roughness: 0.1, depthWrite: false }), 0, r * 1.25, 0)
          g.add(this.goldHalo(r * 0.7, r * 2.6, anim))
          break
        }
      }
    }
    return g
  }

  // ---- buildings ---------------------------------------------------------------------

  buildingMesh(protoId, faction, anim) {
    const g = new THREE.Group()
    const p = BUILDINGS[protoId]
    const r = p.radius
    const kind = p.kind

    const steel = this.mat(0x7d838c, { metalness: 0.55, roughness: 0.5 })
    const copper = this.mat(0xa66a3a, { metalness: 0.7, roughness: 0.35 })
    const rust = this.mat(0x74584a, { metalness: 0.4, roughness: 0.8 })
    const brick = this.mat(0x8a5140, { roughness: 0.9 })
    const slime = () => {
      const m = this.mat(0x8a4fbf, { emissive: 0x5b2a86, emissiveIntensity: 0.4, roughness: 0.35 })
      anim.pulse.push({ mat: m, base: 0.4, amp: 0.15, speed: 1.6 })
      return m
    }
    const water = () => {
      const m = this.mat(0x63d3d8, { emissive: 0x1f8f96, emissiveIntensity: 0.8, roughness: 0.1 })
      anim.pulse.push({ mat: m, base: 0.8, amp: 0.3, speed: 2.2 })
      return m
    }
    const glowCrystal = (intensity = 0.7) => {
      const m = this.mat(0x9cc4f5, { emissive: 0x2f5fae, emissiveIntensity: intensity, roughness: 0.18 })
      anim.pulse.push({ mat: m, base: intensity, amp: 0.25, speed: 1.8 })
      return m
    }

    if (faction === 'republic') {
      if (kind === 'townhall') {
        this.add(g, new THREE.BoxGeometry(r * 1.95, r * 0.7, r * 1.5), rust, 0, r * 0.35, 0)
        this.add(g, new THREE.BoxGeometry(r * 0.6, r * 1.1, r * 1.5), steel, 0, r * 0.55, 0)
        for (const sx of [-1, 1]) {
          this.add(g, new THREE.BoxGeometry(r * 0.72, 0.14, r * 1.2), water(), sx * r * 0.62, r * 0.76, 0)
          this.add(g, new THREE.SphereGeometry(0.14, 7, 5), this.mat(0xe8862f, { emissive: 0x903f00, emissiveIntensity: 0.6 }), sx * r * 0.62 + 0.15, r * 0.86, 0.2)
          this.add(g, new THREE.SphereGeometry(0.12, 7, 5), this.mat(0xe8c53a, { emissive: 0x8f7208, emissiveIntensity: 0.5 }), sx * r * 0.62 - 0.2, r * 0.86, -0.25)
        }
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          this.add(g, new THREE.CylinderGeometry(0.2, 0.26, r * 1.1, 8), copper, sx * r * 0.85, r * 1.2, sz * r * 0.58)
        }
        this.add(g, new THREE.BoxGeometry(r * 0.5, r * 0.45, r * 0.4), steel, 0, r * 1.3, 0)
      } else if (kind === 'supply') {
        this.add(g, new THREE.CylinderGeometry(r * 0.85, r * 0.98, r * 1.5, 14), brick, 0, r * 0.75, 0)
        this.add(g, new THREE.CylinderGeometry(r * 0.9, r * 0.9, r * 0.3, 14), steel, 0, r * 1.62, 0)
        for (let i = 0; i < 3; i++) {
          this.add(g, new THREE.CylinderGeometry(0.1, 0.13, r * 1.3, 8), copper, Math.cos(i * 2.1) * r * 0.45, r * 2.2, Math.sin(i * 2.1) * r * 0.45)
        }
        const gauge = this.add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), this.mat(0xe8e0c8, { emissive: 0x555033, emissiveIntensity: 0.3 }), 0, r * 1.1, r * 0.95, Math.PI / 2)
      } else if (kind === 'production') {
        this.add(g, new THREE.BoxGeometry(r * 1.75, r * 1.05, r * 1.35), rust, 0, r * 0.62, 0)
        this.add(g, new THREE.BoxGeometry(r * 1.9, 0.14, r * 0.85), this.mat(0x7d5b3c), 0, r * 1.35, -r * 0.34, 0.55)
        this.add(g, new THREE.BoxGeometry(r * 1.9, 0.14, r * 0.85), this.mat(0x7d5b3c), 0, r * 1.35, r * 0.34, -0.55)
        // open bay with glow
        this.add(g, new THREE.BoxGeometry(r * 0.8, r * 0.72, 0.1), this.mat(0x2c2418, { emissive: 0xcc7a22, emissiveIntensity: 0.55 }), 0, r * 0.5, r * 0.69)
        this.add(g, new THREE.BoxGeometry(r * 2.1, r * 0.3, r * 0.5), tireLike(this), 0, r * 0.16, r * 0.75)
        this.add(g, new THREE.BoxGeometry(r * 2.1, r * 0.3, r * 0.5), tireLike(this), 0, r * 0.16, -r * 0.75)
        function tireLike(self) { return self.mat(0x24262b, { roughness: 0.95 }) }
      } else if (kind === 'tech') {
        this.add(g, new THREE.CylinderGeometry(r * 0.7, r * 0.85, r * 0.8, 12), brick, 0, r * 0.4, 0)
        for (let i = 0; i < 3; i++) {
          const kettle = this.add(g, new THREE.SphereGeometry(r * (0.58 - i * 0.1), 12, 10), i === 1
            ? this.mat(0xd08a2f, { emissive: 0x9a5c10, emissiveIntensity: 0.7, roughness: 0.25, transparent: true, opacity: 0.9 })
            : copper, 0, r * 1.15 + i * 0.95, 0)
          if (i === 1) anim.pulse.push({ mat: kettle.material, base: 0.7, amp: 0.3, speed: 2.6 })
        }
        this.add(g, new THREE.CylinderGeometry(0.07, 0.07, r * 2.6, 6), copper, r * 0.6, r * 1.5, 0)
      } else if (kind === 'turret') {
        this.add(g, new THREE.CylinderGeometry(r * 1.05, r * 1.2, 0.9, 8), this.mat(0x8e8e8e, { roughness: 0.85 }), 0, 0.45, 0)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          this.add(g, new THREE.SphereGeometry(0.24, 6, 5), this.mat(0xa89a72, { roughness: 1 }), Math.cos(a) * r * 1.15, 0.28, Math.sin(a) * r * 1.15)
        }
        const head = new THREE.Group()
        this.add(head, new THREE.BoxGeometry(r * 0.95, r * 0.62, r * 0.95), this.mat(0x97843c, { metalness: 0.5, roughness: 0.45 }), 0, 0, 0)
        this.add(head, new THREE.CylinderGeometry(0.09, 0.12, r * 1.7, 8), copper, r * 0.85, 0.06, 0, 0, 0, Math.PI / 2)
        this.add(head, new THREE.SphereGeometry(0.16, 7, 6), this.mat(0xe8862f, { emissive: 0x903f00, emissiveIntensity: 0.8 }), r * 1.6, 0.06, 0)
        head.position.y = 1.35
        head.userData.spd = 0.012
        anim.spin.push(head)
        g.add(head)
      } else { // extractor
        this.add(g, new THREE.CylinderGeometry(r * 0.8, r * 0.95, r * 1.15, 10), copper, 0, r * 0.58, 0)
        const juice = this.add(g, new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.1, 10),
          this.mat(0xe8962f, { emissive: 0xa85f10, emissiveIntensity: 0.9, roughness: 0.2 }), 0, r * 1.2, 0)
        anim.pulse.push({ mat: juice.material, base: 0.9, amp: 0.35, speed: 3 })
        this.add(g, new THREE.CylinderGeometry(0.08, 0.08, r * 1.1, 6), steel, r * 0.7, r * 1.3, 0, 0, 0, -0.5)
      }
    } else if (faction === 'panda') {
      if (kind === 'townhall') {
        this.add(g, new THREE.ConeGeometry(r * 1.15, r * 1.35, 9), this.mat(0x5d5648, { roughness: 1 }), 0, r * 0.62, 0)
        const truck = this.add(g, new THREE.BoxGeometry(r * 1.15, r * 0.5, r * 0.72), this.mat(0x6d7a68, { metalness: 0.35, roughness: 0.6 }), 0, r * 1.42, 0, 0.12, 0.4, 0.18)
        for (const sx of [-1, 1]) {
          this.add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), this.mat(0x24262b), sx * r * 0.45, r * 1.72, 0.1, Math.PI / 2.4, 0.4)
        }
        this.add(g, new THREE.CylinderGeometry(r * 1.35, r * 1.5, 0.14, 18), slime(), 0, 0.07, 0)
        // scattered cans
        const canCols = [0xc23b3b, 0x3b7ac2, 0x4fc23b]
        for (let i = 0; i < 5; i++) {
          this.add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.22, 7), this.mat(canCols[i % 3], { metalness: 0.6 }),
            Math.cos(i * 1.4) * r * 0.9, r * 0.3 + i * 0.12, Math.sin(i * 1.4) * r * 0.9, 0.4 * i)
        }
      } else if (kind === 'supply') {
        const fur = this.mat(0x8d8496, { roughness: 1 })
        const dark = this.mat(0x3a3540, { roughness: 1 })
        for (let i = 0; i < 6; i++) {
          const s = this.add(g, new THREE.SphereGeometry(0.52 - i * 0.04, 9, 7), i % 2 ? dark : fur,
            Math.cos(i * 2.4) * 0.5 * (1 - i * 0.13), 0.4 + i * 0.3, Math.sin(i * 2.4) * 0.5 * (1 - i * 0.13))
          if (i === 5) anim.bob.push({ m: s, base: 0.4 + i * 0.3, amp: 0.05, speed: 1.2 })
        }
        this.add(g, new THREE.CylinderGeometry(r * 1.05, r * 1.15, 0.1, 14), slime(), 0, 0.05, 0)
      } else if (kind === 'production') {
        this.add(g, new THREE.BoxGeometry(r * 1.65, r * 0.95, r * 1.15), this.mat(0x7c8577, { metalness: 0.35, roughness: 0.55 }), 0, r * 0.5, 0)
        this.add(g, new THREE.BoxGeometry(r * 1.75, 0.12, r * 1.25), this.mat(0x697161, { metalness: 0.35 }), 0, r * 1.12, -r * 0.35, -0.75)
        // trash bags inside
        for (let i = 0; i < 3; i++) {
          this.add(g, new THREE.SphereGeometry(0.26, 7, 6), this.mat(0x3f4448, { roughness: 0.7 }), (i - 1) * 0.5, r * 1.05, 0.1)
        }
        this.add(g, new THREE.CylinderGeometry(r * 1.2, r * 1.3, 0.1, 14), slime(), 0, 0.05, 0)
      } else if (kind === 'tech') {
        this.add(g, new THREE.BoxGeometry(r * 1.35, r * 1.05, r * 0.85), this.mat(0x7c8577, { metalness: 0.3 }), 0, r * 0.52, 0)
        this.add(g, new THREE.BoxGeometry(r * 1.2, r * 0.85, r * 0.7), this.mat(0x6b5b45, { roughness: 0.9 }), 0, r * 1.35, 0, -0.15)
        const bookCols = [0x9b4444, 0x44709b, 0x4f9b44, 0xc2a144, 0x8a5fae]
        for (let i = 0; i < 5; i++) {
          this.add(g, new THREE.BoxGeometry(0.16, 0.36, 0.1), this.mat(bookCols[i]), -0.45 + i * 0.22, r * 1.5, r * 0.34, 0, 0, (i % 3 - 1) * 0.12)
        }
        this.add(g, new THREE.CylinderGeometry(r * 1.1, r * 1.2, 0.1, 12), slime(), 0, 0.05, 0)
      } else if (kind === 'turret') {
        this.add(g, new THREE.BoxGeometry(r * 1.5, r * 0.42, r * 1.05), this.mat(0x6b5b45, { roughness: 0.9 }), 0, r * 0.26, 0)
        for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
          this.add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.12, 9), this.mat(0x24262b), sx * r * 0.62, r * 0.2, sz * r * 0.45, 0, 0, Math.PI / 2)
        }
        const arm = this.add(g, new THREE.BoxGeometry(0.16, r * 1.8, 0.16), this.mat(0x8a7a5a, { roughness: 0.8 }), -r * 0.15, r * 1.05, 0, 0, 0, 0.55)
        const capDisc = this.add(g, new THREE.CylinderGeometry(0.4, 0.4, 0.09, 12), this.mat(0xb43a3a, { metalness: 0.55, emissive: 0x5e1010, emissiveIntensity: 0.4 }), -r * 0.75, r * 1.85, 0, Math.PI / 2)
        anim.pulse.push({ mat: capDisc.material, base: 0.4, amp: 0.25, speed: 3.2 })
        this.add(g, new THREE.CylinderGeometry(r * 1.05, r * 1.15, 0.09, 12), slime(), 0, 0.05, 0)
      } else { // extractor
        this.add(g, new THREE.CylinderGeometry(r * 0.68, r * 0.9, r * 1.25, 10), this.mat(0x7c8577, { metalness: 0.35 }), 0, r * 0.62, 0)
        const goo = this.add(g, new THREE.SphereGeometry(r * 0.34, 8, 7), slime(), 0, r * 1.4, 0)
        anim.bob.push({ m: goo, base: r * 1.4, amp: 0.08, speed: 2.2 })
      }
    } else { // pallas
      if (kind === 'townhall') {
        this.add(g, new THREE.CylinderGeometry(r * 1.05, r * 1.2, 1.3, 6), this.mat(0x6f7f96, { roughness: 0.5 }), 0, 0.65, 0)
        this.add(g, new THREE.ConeGeometry(r * 0.55, r * 2.5, 6), glowCrystal(0.6), 0, r * 1.6 + 1.1, 0)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          this.add(g, new THREE.ConeGeometry(r * 0.14, r * 0.9, 5), glowCrystal(0.45), Math.cos(a) * r * 0.85, 1.7, Math.sin(a) * r * 0.85)
        }
        g.add(this.goldHalo(r * 0.95, r * 2.6, anim))
        const halo2 = this.goldHalo(r * 0.65, r * 3.1, anim)
        halo2.userData.spd = -0.02
        g.add(halo2)
      } else if (kind === 'supply') {
        this.add(g, new THREE.ConeGeometry(r * 0.72, r * 3.2, 6), glowCrystal(0.75), 0, r * 1.6, 0)
        this.add(g, new THREE.CylinderGeometry(r * 0.9, r * 1.05, 0.5, 6), this.mat(0x6f7f96, { roughness: 0.55 }), 0, 0.25, 0)
        for (let i = 0; i < 4; i++) {
          const c = this.crystal(0.12)
          c.position.set(Math.cos(i * 1.6) * r * 1.0, 1.2 + i * 0.5, Math.sin(i * 1.6) * r * 1.0)
          g.add(c)
          anim.bob.push({ m: c, base: 1.2 + i * 0.5, amp: 0.18, speed: 2 + i * 0.5 })
        }
        const fieldRing = new THREE.Mesh(
          new THREE.RingGeometry(23.3, 24, 56),
          new THREE.MeshBasicMaterial({ color: 0x59c1ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
        )
        fieldRing.rotation.x = -Math.PI / 2
        fieldRing.position.y = 0.04
        g.add(fieldRing)
      } else if (kind === 'production') {
        for (const s of [-1, 1]) {
          const rib = this.add(g, new THREE.TorusGeometry(r * 0.88, 0.14, 8, 22, Math.PI), glowCrystal(0.5), 0, 0.3, 0)
          rib.rotation.y = s * Math.PI / 6
        }
        this.add(g, new THREE.CylinderGeometry(r * 1.0, r * 1.1, 0.35, 6), this.mat(0x6f7f96, { roughness: 0.55 }), 0, 0.18, 0)
        const portal = this.add(g, new THREE.CircleGeometry(r * 0.62, 20),
          this.mat(0x59c1ff, { emissive: 0x2a7fd0, emissiveIntensity: 1.1, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, r * 0.85, 0)
        anim.pulse.push({ mat: portal.material, base: 1.1, amp: 0.45, speed: 2.8 })
        portal.rotation.x = 0
      } else if (kind === 'tech') {
        for (let i = 0; i < 3; i++) {
          const tier = this.add(g, new THREE.CylinderGeometry(r * (0.85 - i * 0.2), r * (0.95 - i * 0.2), 0.42, 8),
            i % 2 ? this.mat(0xd9b64a, { metalness: 0.6, roughness: 0.3, emissive: 0x6a5210, emissiveIntensity: 0.4 }) : glowCrystal(0.4),
            0, 0.35 + i * 1.0, 0)
          if (i > 0) anim.bob.push({ m: tier, base: 0.35 + i * 1.0, amp: 0.06 * i, speed: 1.4 })
        }
        g.add(this.goldHalo(r * 0.8, 3.4, anim))
      } else if (kind === 'turret') {
        this.add(g, new THREE.ConeGeometry(r * 0.62, r * 2.6, 6), glowCrystal(0.55), 0, r * 1.3, 0)
        this.add(g, new THREE.CylinderGeometry(r * 0.8, r * 0.95, 0.4, 6), this.mat(0x6f7f96, { roughness: 0.55 }), 0, 0.2, 0)
        const orb = this.add(g, new THREE.SphereGeometry(0.22, 10, 8),
          this.mat(0x9fd0ff, { emissive: 0x3a80e0, emissiveIntensity: 1.4, roughness: 0.1 }), 0, r * 2.75, 0)
        anim.pulse.push({ mat: orb.material, base: 1.4, amp: 0.6, speed: 4 })
      } else { // extractor
        this.add(g, new THREE.CylinderGeometry(r * 0.9, r * 0.5, r * 1.3, 8), glowCrystal(0.4), 0, r * 0.65, 0)
        const nectar = this.add(g, new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.08, 8),
          this.mat(0xe8b13a, { emissive: 0xb07508, emissiveIntensity: 0.9, roughness: 0.2 }), 0, r * 1.28, 0)
        anim.pulse.push({ mat: nectar.material, base: 0.9, amp: 0.35, speed: 2.4 })
      }
    }
    return g
  }

  resourceMesh(e, anim) {
    const g = new THREE.Group()
    if (e.rtype === 'shiny') {
      for (let i = 0; i < 5; i++) {
        const size = 0.4 + Math.random() * 0.4
        const cr = new THREE.Mesh(
          new THREE.OctahedronGeometry(size),
          this.mat(0x7fd7e8, { emissive: 0x1f7f96, emissiveIntensity: 0.65, roughness: 0.2 })
        )
        cr.position.set((Math.random() - 0.5) * 1.6, size * 0.55, (Math.random() - 0.5) * 1.6)
        cr.rotation.set(Math.random(), Math.random(), Math.random())
        cr.scale.y = 1.4 + Math.random()
        g.add(cr)
        if (i === 0) anim.pulse.push({ mat: cr.material, base: 0.65, amp: 0.2, speed: 1.5 + Math.random() })
      }
    } else {
      const rim = this.add(g, new THREE.TorusGeometry(1.5, 0.38, 10, 22), this.mat(0x7a5a38, { roughness: 1 }), 0, 0.26, 0, Math.PI / 2)
      const juice = this.add(g, new THREE.CylinderGeometry(1.22, 1.22, 0.26, 20),
        this.mat(0xe8962f, { emissive: 0xa85f10, emissiveIntensity: 0.8, roughness: 0.25 }), 0, 0.2, 0)
      anim.pulse.push({ mat: juice.material, base: 0.8, amp: 0.35, speed: 2 })
      for (let i = 0; i < 3; i++) {
        const b = this.add(g, new THREE.SphereGeometry(0.1, 6, 5),
          this.mat(0xffc46a, { emissive: 0xc07818, emissiveIntensity: 1 }), Math.cos(i * 2.1) * 0.6, 0.35, Math.sin(i * 2.1) * 0.6)
        anim.bob.push({ m: b, base: 0.35, amp: 0.22, speed: 2.5 + i })
      }
    }
    return g
  }

  // ---- ghost placement preview ----------------------------------------------------

  setGhost(protoId) {
    this.clearGhost()
    const proto = BUILDINGS[protoId]
    const anim = { spin: [], bob: [], pulse: [] }
    const body = this.buildingMesh(protoId, this.game.players[0].faction, anim)
    const grp = new THREE.Group()
    grp.add(body)
    grp.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone()
        m.material.transparent = true
        m.material.opacity = Math.min(m.material.opacity ?? 1, 0.55)
        m.material.depthWrite = false
        m.castShadow = false
      }
    })
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(proto.radius + 0.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.04
    grp.add(disc)
    if (proto.power) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(23.4, 24, 56),
        new THREE.MeshBasicMaterial({ color: 0x59c1ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.05
      grp.add(ring)
    }
    grp.visible = false
    this.scene.add(grp)
    this.ghost = { grp, disc, protoId }
  }

  moveGhost(x, z, valid) {
    if (!this.ghost) return
    this.ghost.grp.visible = true
    this.ghost.grp.position.set(x, 0, z)
    this.ghost.disc.material.color.setHex(valid ? 0x4dff88 : 0xff5544)
  }

  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost.grp)
      this.ghost = null
    }
  }

  // ---- combat / feedback effects ----------------------------------------------------

  shotFx(ev) {
    const faction = this.game.players[ev.owner]?.faction
    if (faction === 'pallas') {
      // beam
      const color = 0x9fd0ff
      const pts = [new THREE.Vector3(ev.from.x, 1.8, ev.from.z), new THREE.Vector3(ev.to.x, 1.2, ev.to.z)]
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 })
      )
      this.scene.add(line)
      this.effects.push({ obj: line, t0: performance.now(), dur: 160, update: (t) => { line.material.opacity = 1 - t } })
      this.impact(ev.to.x, ev.to.z, color)
      return
    }
    const d = Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z)
    if (d < 3) { // melee swipe
      this.impact(ev.to.x, ev.to.z, faction === 'panda' ? 0xc07be0 : 0xffb347)
      return
    }
    // arcing projectile
    const color = faction === 'panda' ? 0xc07be0 : 0xff9a2e
    const high = ev.splash ? 5.5 : 2.2
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(ev.splash ? 0.26 : 0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color })
    )
    this.scene.add(ball)
    const { from, to } = ev
    this.effects.push({
      obj: ball, t0: performance.now(), dur: 90 + d * 16,
      update: (t) => {
        ball.position.set(
          from.x + (to.x - from.x) * t,
          1 + Math.sin(t * Math.PI) * high,
          from.z + (to.z - from.z) * t
        )
        if (t > 0.93) this.impact(to.x, to.z, color)
      },
    })
  }

  impact(x, z, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.35, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.15, z)
    this.scene.add(ring)
    this.effects.push({
      obj: ring, t0: performance.now(), dur: 260,
      update: (t) => { ring.scale.setScalar(1 + t * 3.5); ring.material.opacity = 0.8 * (1 - t) },
    })
  }

  deathFx(x, z, kind) {
    const big = kind === 'building'
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 1.6 : 0.7, 10, 8),
      new THREE.MeshBasicMaterial({ color: big ? 0xffaa55 : 0xcccccc, transparent: true, opacity: 0.75 })
    )
    s.position.set(x, 1, z)
    this.scene.add(s)
    this.effects.push({
      obj: s, t0: performance.now(), dur: big ? 700 : 420,
      update: (t) => { s.scale.setScalar(1 + t * (big ? 3 : 2.2)); s.material.opacity = 0.75 * (1 - t) },
    })
  }

  // ---- picking -----------------------------------------------------------------------

  screenToGround(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera)
    const pt = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(this.groundPlane, pt)
    return pt
  }

  pickEntity(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera)
    const groups = [...this.meshes.values()]
    const hits = this.raycaster.intersectObjects(groups, true)
    for (const h of hits) {
      let o = h.object
      while (o && o.userData.entityId === undefined) o = o.parent
      if (o) return this.game.entities.get(o.userData.entityId)
    }
    return null
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera)
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight }
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }
}
