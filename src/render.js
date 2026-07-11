import * as THREE from 'three'
import { FACTIONS } from './data.js'
import { MAP, each } from './state.js'

export class Renderer {
  constructor(canvas, game) {
    this.game = game
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a2027)
    this.scene.fog = new THREE.Fog(0x1a2027, 160, 340)

    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 600)
    this.camTarget = new THREE.Vector3(-MAP / 2 + 22, 0, MAP / 2 - 22)
    this.camDist = 62
    this.updateCamera()

    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6)
    sun.position.set(60, 90, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = 110
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc
    sun.shadow.camera.far = 300
    this.sun = sun
    this.scene.add(sun, sun.target)
    this.scene.add(new THREE.HemisphereLight(0x93a7c4, 0x40352a, 1.1))

    this.buildGround()

    this.meshes = new Map() // entityId -> group
    this.effects = []
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

  buildGround() {
    // painterly dirt via canvas texture
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#6e5a41'
    ctx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 2600; i++) {
      const s = 2 + Math.random() * 9
      ctx.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${70 + Math.random() * 50 | 0},${45 + Math.random() * 40 | 0},${0.12 + Math.random() * 0.2})`
      ctx.beginPath()
      ctx.arc(Math.random() * 512, Math.random() * 512, s, 0, 7)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(9, 9)
    tex.colorSpace = THREE.SRGBColorSpace
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP, MAP),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    // border walls (visual)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 1 })
    const mk = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, h), wallMat)
      m.position.set(x, 1.5, z)
      this.scene.add(m)
    }
    const L = MAP / 2 + 1.5
    mk(MAP + 6, 3, 0, -L); mk(MAP + 6, 3, 0, L); mk(3, MAP + 6, -L, 0); mk(3, MAP + 6, L, 0)
  }

  // ---- entity meshes -------------------------------------------------------

  sync() {
    const g = this.game
    // consume sim events
    for (const ev of g.events) {
      if (ev.type === 'spawn') {
        const e = g.entities.get(ev.id)
        if (e && !this.meshes.has(ev.id)) this.meshes.set(ev.id, this.buildMesh(e))
      } else if (ev.type === 'death' || ev.type === 'depleted') {
        const grp = this.meshes.get(ev.id)
        if (grp) {
          this.scene.remove(grp)
          this.meshes.delete(ev.id)
          if (ev.type === 'death') this.puff(ev.x, ev.z)
        }
      } else if (ev.type === 'shot') {
        this.tracer(ev.from, ev.to, ev.owner)
      }
    }

    // update transforms + bars
    for (const [id, grp] of this.meshes) {
      const e = g.entities.get(id)
      if (!e || e.dead) { this.scene.remove(grp); this.meshes.delete(id); continue }
      grp.position.set(e.x, 0, e.z)
      if (e.kind === 'unit') grp.rotation.y = -e.rot + Math.PI / 2
      if (e.kind === 'building' && e.constructing) {
        const s = 0.35 + 0.65 * e.progress
        grp.scale.setScalar(s)
      } else if (grp.scale.x !== 1) grp.scale.setScalar(1)
      const ud = grp.userData
      if (ud.bar) this.updateBar(e, ud)
      if (ud.selRing) ud.selRing.visible = !!e.selected
      if (ud.spin) ud.spin.rotation.y += 0.02
      if (ud.bob) ud.bob.position.y = ud.bobBase + Math.sin(performance.now() / 400 + id) * 0.15
    }

    // effects
    const now = performance.now()
    this.effects = this.effects.filter((fx) => {
      const t = (now - fx.t0) / fx.dur
      if (t >= 1) { this.scene.remove(fx.obj); return false }
      if (fx.update) fx.update(t)
      return true
    })
  }

  buildMesh(e) {
    const grp = new THREE.Group()
    grp.position.set(e.x, 0, e.z)
    let body
    if (e.kind === 'resource') body = this.resourceMesh(e)
    else if (e.kind === 'building') body = this.buildingMesh(e)
    else body = this.unitMesh(e)
    grp.add(body)
    grp.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    grp.userData.entityId = e.id
    if (body.userDataSpin) grp.userData.spin = body.userDataSpin
    if (body.userDataBob) { grp.userData.bob = body.userDataBob.bob; grp.userData.bobBase = body.userDataBob.bob.position.y }

    if (e.kind !== 'resource') {
      // selection ring
      const rad = (e.proto.radius || 1) + 0.35
      const ringCol = e.owner === 0 ? 0x4dff88 : 0xff5544
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rad - 0.16, rad, 36),
        new THREE.MeshBasicMaterial({ color: ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.06
      ring.visible = false
      grp.add(ring)
      grp.userData.selRing = ring
      // hp bar sprite
      const bar = this.makeBar()
      bar.sprite.position.y = this.barHeight(e)
      grp.add(bar.sprite)
      grp.userData.bar = bar
      this.updateBar(e, grp.userData)
    }
    this.scene.add(grp)
    return grp
  }

  barHeight(e) {
    if (e.kind === 'building') return e.proto.radius * 1.6 + 1.6
    return e.proto.radius * 2 + 1.4
  }

  makeBar() {
    const c = document.createElement('canvas')
    c.width = 64; c.height = 12
    const tex = new THREE.CanvasTexture(c)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
    sprite.scale.set(2.6, 0.5, 1)
    return { canvas: c, tex, sprite }
  }

  updateBar(e, ud) {
    const { canvas, tex, sprite } = ud.bar
    sprite.position.y = this.barHeight(e)
    const full = e.hp >= e.maxHp && (!e.maxShield || e.shield >= e.maxShield) && !e.constructing
    sprite.visible = e.selected || !full
    if (!sprite.visible) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 64, 12)
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, 0, 64, 12)
    const hpF = Math.max(0, e.hp / e.maxHp)
    ctx.fillStyle = hpF > 0.6 ? '#46d160' : hpF > 0.3 ? '#e8b83a' : '#e0452f'
    ctx.fillRect(1, e.maxShield ? 6 : 1, Math.round(62 * hpF), e.maxShield ? 5 : 10)
    if (e.maxShield) {
      ctx.fillStyle = '#59c1ff'
      ctx.fillRect(1, 1, Math.round(62 * Math.max(0, e.shield / e.maxShield)), 4)
    }
    tex.needsUpdate = true
  }

  // ---- stylized meshes -------------------------------------------------------

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...opts })
  }

  factionPalette(e) {
    const f = FACTIONS[e.kind === 'resource' ? 'republic' : (this.game.players[e.owner]?.faction || 'republic')]
    return { base: f.color, accent: f.accent }
  }

  unitMesh(e) {
    const { base, accent } = this.factionPalette(e)
    const g = new THREE.Group()
    const p = e.proto
    const r = p.radius
    const faction = this.game.players[e.owner].faction

    if (faction === 'pallas') {
      // floating furball + crystal
      const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.85, 18, 14), this.mat(base, { roughness: 0.9 }))
      body.position.y = r * 1.2
      const bob = new THREE.Group()
      bob.add(body)
      if (p.tier >= 2 || p.worker) {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(r * 0.4), this.mat(0x9fd0ff, { emissive: 0x3a70c0, emissiveIntensity: 0.8, roughness: 0.3 }))
        cr.position.set(0, r * 2.1, 0)
        bob.add(cr)
      }
      if (p.tier === 3) body.scale.setScalar(1.35)
      g.add(bob)
      g.userData = {}
      const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.75, 0.06, 8, 24), this.mat(accent, { emissive: 0x8a6a10, emissiveIntensity: 0.7 }))
      halo.rotation.x = Math.PI / 2
      halo.position.y = r * 2.3
      bob.add(halo)
      const parent = g.parent // set later
      // store bob for animation at group level via userData on outer group when added
      g.onAdd = null
      g.userDataBob = { bob, base: 0 }
      // legs: 4 crystal spikes for stalker-likes
      if (p.range > 2 && !p.worker) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          const leg = new THREE.Mesh(new THREE.ConeGeometry(0.16, r * 1.6, 5), this.mat(0xaecdf5, { roughness: 0.35 }))
          leg.position.set(Math.cos(a) * r * 0.7, r * 0.55, Math.sin(a) * r * 0.7)
          leg.rotation.z = Math.cos(a) * 0.5
          leg.rotation.x = -Math.sin(a) * 0.5
          g.add(leg)
        }
      }
    } else if (faction === 'panda') {
      // scrappy: body + tail stripes + junk
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.6, r * 0.8, 6, 10), this.mat(base, { roughness: 0.95 }))
      body.position.y = r * 0.95
      body.rotation.x = Math.PI / 2 * 0.12
      g.add(body)
      const mask = new THREE.Mesh(new THREE.SphereGeometry(r * 0.42, 12, 10), this.mat(0x3a3540))
      mask.position.set(0, r * 1.15, r * 0.55)
      g.add(mask)
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, r * 1.3, 8), this.mat(0x574f5c))
      tail.position.set(0, r * 0.9, -r * 0.9)
      tail.rotation.x = -0.9
      g.add(tail)
      if (p.tier >= 2) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(r * 0.4, 0.12, 8, 16), this.mat(0x2e2e2e))
        wheel.rotation.y = Math.PI / 2
        wheel.position.set(0, r * 0.4, r * 0.5)
        g.add(wheel)
      }
      if (p.tier === 3) {
        const armor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, r * 1.1, r * 1.7), this.mat(0x5b6158, { metalness: 0.4 }))
        armor.position.y = r * 1.3
        g.add(armor)
      }
      if (p.aura) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, r * 0.9, 10), this.mat(0xd97b29))
        cone.position.y = r * 1.9
        g.add(cone)
      }
    } else {
      // republic: chunky machine + rodent
      const hull = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.9, r * 1.9), this.mat(0x7a7f85, { metalness: 0.45, roughness: 0.6 }))
      hull.position.y = r * 0.75
      g.add(hull)
      const capy = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.42, r * 0.5, 6, 10), this.mat(base, { roughness: 0.95 }))
      capy.position.set(0, r * 1.5, -r * 0.15)
      capy.rotation.x = Math.PI / 2 * 0.15
      g.add(capy)
      const snout = new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.3, r * 0.4), this.mat(0x9c7b52))
      snout.position.set(0, r * 1.55, r * 0.45)
      g.add(snout)
      for (const sx of [-1, 1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.25, 12), this.mat(0x26262a))
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(sx * r * 0.8, r * 0.35, r * 0.5)
        g.add(wheel)
        const wheel2 = wheel.clone()
        wheel2.position.z = -r * 0.5
        g.add(wheel2)
      }
      if (p.range > 5) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, r * 1.6, 8), this.mat(0x8f6f3f, { metalness: 0.6 }))
        barrel.rotation.x = Math.PI / 2.6
        barrel.position.set(0, r * 1.2, r * 0.6)
        g.add(barrel)
      }
      if (p.tier === 3) {
        hull.scale.set(1.2, 1.5, 1.2)
        for (const sx of [-1, 1]) {
          const gat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, r * 1.4, 8), this.mat(0x555a60, { metalness: 0.6 }))
          gat.rotation.x = Math.PI / 2
          gat.position.set(sx * r * 0.95, r * 1.1, r * 0.7)
          g.add(gat)
        }
      }
      if (p.aura) {
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.7, r * 0.4, 14), this.mat(0x74c7d6, { emissive: 0x2a7f96, emissiveIntensity: 0.4 }))
        tub.position.y = r * 1.35
        g.add(tub)
      }
    }
    return g
  }

  buildingMesh(e) {
    const { base, accent } = this.factionPalette(e)
    const g = new THREE.Group()
    const p = e.proto
    const r = p.radius
    const faction = this.game.players[e.owner].faction
    const kind = p.kind

    const primary = faction === 'pallas' ? 0x8fb7ea : faction === 'panda' ? 0x6f6a75 : 0x8b8f94
    const structMat = this.mat(primary, { metalness: faction === 'pallas' ? 0.1 : 0.4, roughness: faction === 'pallas' ? 0.3 : 0.7 })

    if (faction === 'pallas') {
      if (kind === 'supply' || kind === 'turret') {
        const ob = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, r * 3.4, 6), this.mat(0x9cc4f5, { emissive: 0x2f5fae, emissiveIntensity: kind === 'supply' ? 0.65 : 0.35, roughness: 0.25 }))
        ob.position.y = r * 1.7
        g.add(ob)
        if (kind === 'supply') {
          const fieldRing = new THREE.Mesh(new THREE.RingGeometry(23.4, 24, 48), new THREE.MeshBasicMaterial({ color: 0x59c1ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }))
          fieldRing.rotation.x = -Math.PI / 2
          fieldRing.position.y = 0.05
          g.add(fieldRing)
        }
      } else if (kind === 'townhall') {
        const baseM = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 1.4, 6), structMat)
        baseM.position.y = 0.7
        g.add(baseM)
        const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 2.6, 6), this.mat(0xa8ccf7, { emissive: 0x3868b8, emissiveIntensity: 0.5, roughness: 0.2 }))
        spire.position.y = r * 1.6 + 1.2
        g.add(spire)
        const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.12, 8, 40), this.mat(accent, { emissive: 0x8a6a10, emissiveIntensity: 0.9 }))
        halo.rotation.x = Math.PI / 2
        halo.position.y = r * 2.4
        g.add(halo)
        g.userDataSpin = halo
      } else if (kind === 'production') {
        for (const s of [-1, 1]) {
          const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, 0.16, 8, 24, Math.PI), this.mat(0xa8ccf7, { roughness: 0.25, emissive: 0x2f5fae, emissiveIntensity: 0.4 }))
          rib.rotation.y = s * Math.PI / 7
          rib.position.y = 0.4
          g.add(rib)
        }
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 4), structMat)
        plate.position.y = 0.2
        plate.rotation.y = Math.PI / 4
        g.add(plate)
      } else if (kind === 'tech') {
        for (let i = 0; i < 3; i++) {
          const tier = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.9 - i * 0.22), r * (1 - i * 0.22), 0.5, 8), i % 2 ? this.mat(accent, { metalness: 0.5 }) : structMat)
          tier.position.y = 0.4 + i * 1.1
          g.add(tier)
        }
      } else { // extractor
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.5, r * 1.4, 8), this.mat(0x9cc4f5, { emissive: 0xcc8a2a, emissiveIntensity: 0.35, roughness: 0.3 }))
        cup.position.y = r * 0.7
        g.add(cup)
      }
    } else if (faction === 'panda') {
      if (kind === 'townhall') {
        const mound = new THREE.Mesh(new THREE.ConeGeometry(r * 1.1, r * 1.3, 9), this.mat(0x5d5648, { roughness: 1 }))
        mound.position.y = r * 0.6
        g.add(mound)
        const truck = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, r * 0.5, r * 0.7), this.mat(0x6d7a68, { metalness: 0.3 }))
        truck.position.y = r * 1.35
        truck.rotation.z = 0.15
        g.add(truck)
        const slime = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.4, 0.12, 16), this.mat(0x8a4fbf, { emissive: 0x5b2a86, emissiveIntensity: 0.35, roughness: 0.4 }))
        slime.position.y = 0.06
        g.add(slime)
      } else if (kind === 'supply') {
        // pile of raccoons = lumpy spheres
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.55 - i * 0.05, 10, 8), this.mat(base, { roughness: 1 }))
          const a = i * 2.4
          s.position.set(Math.cos(a) * 0.5 * (1 - i * 0.15), 0.4 + i * 0.34, Math.sin(a) * 0.5 * (1 - i * 0.15))
          g.add(s)
        }
      } else if (kind === 'production') {
        const bin = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.9, r * 1.1), this.mat(0x7c8577, { metalness: 0.35 }))
        bin.position.y = r * 0.45
        g.add(bin)
        const lid = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, 0.12, r * 1.2), this.mat(0x697161, { metalness: 0.35 }))
        lid.position.set(0, r * 0.95, -r * 0.28)
        lid.rotation.x = -0.7
        g.add(lid)
        const slime = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.25, 0.1, 14), this.mat(0x8a4fbf, { emissive: 0x5b2a86, emissiveIntensity: 0.3 }))
        slime.position.y = 0.05
        g.add(slime)
      } else if (kind === 'tech') {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, r * 1.6, r * 0.8), this.mat(0x6b5b45, { roughness: 0.9 }))
        shelf.position.y = r * 0.8
        g.add(shelf)
        for (let i = 0; i < 4; i++) {
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.14), this.mat([0x9b4444, 0x44709b, 0x4f9b44, 0xc2a144][i]))
          book.position.set(-0.4 + i * 0.26, r * 1.1, r * 0.42)
          g.add(book)
        }
      } else if (kind === 'turret') {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, r * 0.5, r * 1.0), this.mat(0x6b5b45))
        frame.position.y = r * 0.3
        g.add(frame)
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, r * 1.7, 0.18), this.mat(0x8a7a5a))
        arm.position.y = r * 1.0
        arm.rotation.z = 0.5
        g.add(arm)
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), this.mat(0xb43a3a, { metalness: 0.5 }))
        cap.position.set(-r * 0.65, r * 1.7, 0)
        cap.rotation.x = Math.PI / 2
        g.add(cap)
      } else {
        const still = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.9, r * 1.3, 10), this.mat(0x7c8577, { metalness: 0.3 }))
        still.position.y = r * 0.65
        g.add(still)
      }
    } else { // republic
      if (kind === 'townhall') {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, r * 0.8, r * 1.5), structMat)
        hull.position.y = r * 0.4
        g.add(hull)
        const pool = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, 0.2, r * 1.1), this.mat(0x63d3d8, { emissive: 0x2a8f96, emissiveIntensity: 0.55, roughness: 0.2 }))
        pool.position.y = r * 0.85
        g.add(pool)
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, r * 0.9, 8), this.mat(0xa06a3a, { metalness: 0.6 }))
          stack.position.set(sx * r * 0.8, r * 1.1, sz * r * 0.6)
          g.add(stack)
        }
      } else if (kind === 'supply') {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.9, r * 1.9, 12), this.mat(0x9a5b34, { metalness: 0.5, roughness: 0.5 }))
        drum.position.y = r * 0.95
        g.add(drum)
        for (let i = 0; i < 3; i++) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, r * 1.2, 8), this.mat(0xb27847, { metalness: 0.7 }))
          pipe.position.set(Math.cos(i * 2.1) * r * 0.5, r * 2.2, Math.sin(i * 2.1) * r * 0.5)
          g.add(pipe)
        }
      } else if (kind === 'production') {
        const shed = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, r * 1.0, r * 1.3), structMat)
        shed.position.y = r * 0.6
        g.add(shed)
        const roofL = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, 0.12, r * 0.8), this.mat(0x7d5b3c))
        roofL.position.set(0, r * 1.25, -r * 0.32)
        roofL.rotation.x = 0.5
        g.add(roofL)
        const roofR = roofL.clone()
        roofR.position.z = r * 0.32
        roofR.rotation.x = -0.5
        g.add(roofR)
      } else if (kind === 'tech') {
        for (let i = 0; i < 3; i++) {
          const kettle = new THREE.Mesh(new THREE.SphereGeometry(r * (0.62 - i * 0.13), 12, 10), i === 1 ? this.mat(0xd08a2f, { emissive: 0x8a5210, emissiveIntensity: 0.5, roughness: 0.3 }) : this.mat(0x9a5b34, { metalness: 0.6 }))
          kettle.position.y = 0.6 + i * 1.05
          g.add(kettle)
        }
      } else if (kind === 'turret') {
        const bunker = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.8, 8), this.mat(0x8e8e8e))
        bunker.position.y = 0.4
        g.add(bunker)
        const head = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.6, r * 0.9), this.mat(0x97843c, { metalness: 0.5 }))
        head.position.y = 1.1
        g.add(head)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, r * 1.5, 8), this.mat(0xb27847, { metalness: 0.7 }))
        barrel.rotation.z = Math.PI / 2
        barrel.position.set(r * 0.8, 1.15, 0)
        g.add(barrel)
        g.userDataSpin = head
      } else {
        const rig = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.95, r * 1.2, 8), this.mat(0x9a5b34, { metalness: 0.55 }))
        rig.position.y = r * 0.6
        g.add(rig)
      }
    }
    return g
  }

  resourceMesh(e) {
    const g = new THREE.Group()
    if (e.rtype === 'shiny') {
      for (let i = 0; i < 4; i++) {
        const cr = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.45 + Math.random() * 0.35),
          this.mat(0x7fd7e8, { emissive: 0x1f7f96, emissiveIntensity: 0.6, roughness: 0.25 })
        )
        cr.position.set((Math.random() - 0.5) * 1.4, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 1.4)
        cr.rotation.set(Math.random(), Math.random(), Math.random())
        g.add(cr)
      }
    } else {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 10, 20), this.mat(0x7a5a38, { roughness: 1 }))
      rim.rotation.x = -Math.PI / 2
      rim.position.y = 0.25
      g.add(rim)
      const juice = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.25, 20), this.mat(0xe89a2f, { emissive: 0xa85f10, emissiveIntensity: 0.7, roughness: 0.3 }))
      juice.position.y = 0.22
      g.add(juice)
    }
    return g
  }

  // ---- effects ---------------------------------------------------------------

  tracer(from, to, owner) {
    const color = this.game.players[owner]?.faction === 'pallas' ? 0x9fd0ff
      : this.game.players[owner]?.faction === 'panda' ? 0xc07be0 : 0xffb347
    const pts = [new THREE.Vector3(from.x, 1.6, from.z), new THREE.Vector3(to.x, 1.2, to.z)]
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    )
    this.scene.add(line)
    this.effects.push({ obj: line, t0: performance.now(), dur: 140, update: (t) => { line.material.opacity = 0.9 * (1 - t) } })
  }

  puff(x, z) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.7 }))
    s.position.set(x, 1, z)
    this.scene.add(s)
    this.effects.push({
      obj: s, t0: performance.now(), dur: 450,
      update: (t) => { s.scale.setScalar(1 + t * 2.2); s.material.opacity = 0.7 * (1 - t) },
    })
  }

  // ---- picking ----------------------------------------------------------------

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
