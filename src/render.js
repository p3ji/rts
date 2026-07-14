import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BUILDINGS, UNITS, MODELS, MODEL_FOOTPRINT, PLAYER_COLORS } from './data.js'
import { MAP, each, isVisible, isExplored } from './state.js'

// ---- asset loading -------------------------------------------------------------

const CACHE = new Map() // name -> normalized THREE.Group (origin at footprint center, base at y=0)

export async function loadAssets(onProgress) {
  const names = new Set()
  for (const pair of Object.values(MODELS.buildings)) pair.forEach((n) => names.add(n))
  for (const list of Object.values(MODELS.resources)) list.forEach((n) => names.add(n))
  for (const list of Object.values(MODELS.scenery)) list.forEach((n) => names.add(n))
  const list = [...names]
  const loader = new GLTFLoader()
  let done = 0
  await Promise.all(list.map(async (name) => {
    const gltf = await loader.loadAsync(`/models/${name}.gltf`)
    const grp = new THREE.Group()
    grp.add(gltf.scene)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    const center = box.getCenter(new THREE.Vector3())
    gltf.scene.position.x -= center.x
    gltf.scene.position.z -= center.z
    gltf.scene.position.y -= box.min.y
    const size = box.getSize(new THREE.Vector3())
    grp.userData.size = size
    grp.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })
    CACHE.set(name, grp)
    done++
    onProgress?.(done / list.length)
  }))
}

function modelInstance(name, footprint) {
  const src = CACHE.get(name)
  if (!src) return new THREE.Group()
  const clone = src.clone(true)
  const size = src.userData.size
  const s = footprint / Math.max(size.x, size.z)
  clone.scale.setScalar(s)
  return clone
}

export function buildingModelName(protoId, age) {
  const pair = MODELS.buildings[protoId]
  return pair[age >= 2 ? 1 : 0]
}

// ---- runtime portrait generation --------------------------------------------------

export const PORTRAITS = {} // protoId -> dataURL, filled by generatePortraits()

export function generatePortraits() {
  const W = 220, H = 140
  const rt = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  rt.setSize(W, H)
  rt.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7fae6a)
  const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x6a5a40, 1.4))
  const sun = new THREE.DirectionalLight(0xffeecc, 2.4)
  sun.position.set(4, 7, 5)
  scene.add(sun)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 24), new THREE.MeshStandardMaterial({ color: 0x86b56e, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  const shoot = (obj, key) => {
    scene.add(obj)
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z)
    cam.position.set(c.x + r * 1.15, c.y + r * 0.85, c.z + r * 1.35)
    cam.lookAt(c.x, c.y - size.y * 0.05, c.z)
    rt.render(scene, cam)
    PORTRAITS[key] = rt.domElement.toDataURL('image/png')
    scene.remove(obj)
  }

  for (const id of Object.keys(BUILDINGS)) {
    shoot(modelInstance(buildingModelName(id, 1), MODEL_FOOTPRINT[id]), id)
  }
  for (const id of Object.keys(UNITS)) {
    const obj = id === 'catapult' ? makeCatapult(0x8a7350, UNITS[id].radius) : makePerson(id, 0xd8b04a, UNITS[id].radius).grp
    obj.rotation.y = -0.5
    shoot(obj, id)
  }
  rt.dispose()
}

// ---- boxy Wobbleton-style people ---------------------------------------------------

const SKIN = 0xf7d9b8
let faceTex = null
function getFaceTexture() {
  if (faceTex) return faceTex
  const cv = document.createElement('canvas')
  cv.width = cv.height = 64
  const c = cv.getContext('2d')
  c.fillStyle = '#2e2440'
  c.beginPath(); c.arc(20, 26, 4.5, 0, 7); c.arc(44, 26, 4.5, 0, 7); c.fill()
  c.lineWidth = 3; c.strokeStyle = '#2e2440'
  c.beginPath(); c.arc(32, 37, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke()
  c.fillStyle = 'rgba(244,166,176,.8)'
  c.beginPath(); c.arc(13, 37, 4, 0, 7); c.arc(51, 37, 4, 0, 7); c.fill()
  faceTex = new THREE.CanvasTexture(cv)
  return faceTex
}

function lamb(color) { return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02 }) }
function metal(color = 0xb8bfc8) { return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 }) }

function box(parent, w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

// Builds a boxy villager-style person for the given role. Returns { grp, arms }.
function makePerson(role, teamColor, radius = 0.55) {
  const s = radius / 0.55 // scale relative to standard villager
  const grp = new THREE.Group()
  const team = lamb(teamColor)
  const skin = lamb(SKIN)

  const bodyH = role === 'priest' ? 0.62 : 0.5
  const bodyMat = role === 'priest' ? lamb(0xf0ead8) : team
  const body = box(grp, 0.44 * s, bodyH * s, 0.32 * s, bodyMat, 0, (bodyH / 2 + 0.16) * s, 0)

  // legs
  box(grp, 0.13 * s, 0.16 * s, 0.14 * s, lamb(0x4a3f38), -0.11 * s, 0.08 * s, 0)
  box(grp, 0.13 * s, 0.16 * s, 0.14 * s, lamb(0x4a3f38), 0.11 * s, 0.08 * s, 0)

  // head with face
  const headY = (0.16 + bodyH + 0.19) * s
  const faceMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9, map: getFaceTexture() })
  const plain = lamb(SKIN)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4 * s, 0.36 * s, 0.36 * s),
    [plain, plain, plain, plain, faceMat, plain])
  head.position.set(0, headY, 0.02 * s)
  head.castShadow = true
  grp.add(head)

  // arms (swing while walking)
  const armL = box(grp, 0.1 * s, 0.3 * s, 0.1 * s, role === 'priest' ? bodyMat : team, -0.28 * s, (0.16 + bodyH - 0.14) * s, 0)
  const armR = box(grp, 0.1 * s, 0.3 * s, 0.1 * s, role === 'priest' ? bodyMat : team, 0.28 * s, (0.16 + bodyH - 0.14) * s, 0)

  const hatY = headY + 0.24 * s
  switch (role) {
    case 'villager': {
      box(grp, 0.56 * s, 0.05 * s, 0.52 * s, lamb(0xd8b466), 0, hatY - 0.05 * s, 0)
      box(grp, 0.3 * s, 0.14 * s, 0.28 * s, lamb(0xc9a552), 0, hatY + 0.03 * s, 0)
      // tools/carry meshes toggled by the renderer
      const log = box(grp, 0.16 * s, 0.16 * s, 0.5 * s, lamb(0x8a6238), 0, (0.16 + bodyH + 0.02) * s, 0.3 * s)
      const nug = box(grp, 0.2 * s, 0.16 * s, 0.2 * s, metal(0xe8c447), 0, (0.16 + bodyH + 0.02) * s, 0.28 * s)
      log.visible = nug.visible = false
      grp.userData.carryW = log
      grp.userData.carryG = nug
      break
    }
    case 'swordsman': {
      box(grp, 0.44 * s, 0.2 * s, 0.4 * s, metal(), 0, hatY - 0.03 * s, 0) // helm
      box(grp, 0.08 * s, 0.16 * s, 0.05 * s, metal(), 0, headY, 0.2 * s)   // nose guard
      box(grp, 0.07 * s, 0.5 * s, 0.07 * s, metal(0xd8dde4), 0.36 * s, (0.16 + bodyH + 0.1) * s, 0.08 * s, 0.3) // sword
      box(grp, 0.16 * s, 0.1 * s, 0.05 * s, lamb(0x6a4a2e), 0.35 * s, (0.16 + bodyH - 0.12) * s, 0.08 * s)      // hilt
      box(grp, 0.06 * s, 0.4 * s, 0.34 * s, team, -0.36 * s, (0.16 + bodyH - 0.1) * s, 0.06 * s)                // shield
      break
    }
    case 'archer': {
      box(grp, 0.44 * s, 0.16 * s, 0.4 * s, team, 0, hatY - 0.06 * s, 0)
      box(grp, 0.24 * s, 0.2 * s, 0.24 * s, team, 0, hatY + 0.06 * s, -0.04 * s) // hood peak
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3 * s, 0.03 * s, 6, 12, Math.PI), lamb(0x7a5a34))
      bow.position.set(-0.34 * s, (0.16 + bodyH) * s, 0.1 * s)
      bow.rotation.z = Math.PI / 2
      bow.castShadow = true
      grp.add(bow)
      box(grp, 0.12 * s, 0.34 * s, 0.12 * s, lamb(0x6a4a2e), 0.1 * s, (0.16 + bodyH + 0.05) * s, -0.22 * s, 0.2) // quiver
      break
    }
    case 'knight': {
      box(grp, 0.46 * s, 0.3 * s, 0.42 * s, metal(), 0, hatY, 0)          // great helm
      box(grp, 0.1 * s, 0.22 * s, 0.1 * s, team, 0, hatY + 0.24 * s, 0)  // plume
      box(grp, 0.2 * s, 0.12 * s, 0.36 * s, metal(0x9aa4b0), -0.3 * s, (0.16 + bodyH) * s, 0)
      box(grp, 0.2 * s, 0.12 * s, 0.36 * s, metal(0x9aa4b0), 0.3 * s, (0.16 + bodyH) * s, 0) // pauldrons
      box(grp, 0.08 * s, 0.62 * s, 0.08 * s, metal(0xd8dde4), 0.4 * s, (0.16 + bodyH + 0.14) * s, 0.08 * s, 0.25)
      box(grp, 0.07 * s, 0.5 * s, 0.4 * s, team, -0.4 * s, (0.16 + bodyH - 0.08) * s, 0.05 * s)
      break
    }
    case 'priest': {
      box(grp, 0.3 * s, 0.34 * s, 0.28 * s, lamb(0xf0ead8), 0, hatY + 0.08 * s, 0) // mitre
      box(grp, 0.32 * s, 0.06 * s, 0.3 * s, lamb(0xd9b64a), 0, hatY - 0.06 * s, 0)
      box(grp, 0.46 * s, 0.08 * s, 0.34 * s, lamb(0xd9b64a), 0, (0.16 + bodyH * 0.45) * s, 0) // belt
      const staff = box(grp, 0.05 * s, 0.9 * s, 0.05 * s, lamb(0x7a5a34), 0.34 * s, (0.16 + bodyH) * s, 0.06 * s)
      box(grp, 0.12 * s, 0.12 * s, 0.12 * s, metal(0xe8c447), 0.34 * s, (0.16 + bodyH + 0.5) * s, 0.06 * s, 0.6, 0.6)
      break
    }
  }
  return { grp, armL, armR }
}

function makeCatapult(teamColor, radius = 1.0) {
  const s = radius
  const grp = new THREE.Group()
  const wood = lamb(0x8a6a42)
  const darkWood = lamb(0x6a4e30)
  box(grp, 1.5 * s, 0.22 * s, 1.0 * s, wood, 0, 0.34 * s, 0)
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.14 * s, 10), darkWood)
    w.position.set(sx * 0.6 * s, 0.26 * s, sz * 0.48 * s)
    w.rotation.x = Math.PI / 2
    w.castShadow = true
    grp.add(w)
  }
  box(grp, 0.16 * s, 0.5 * s, 0.16 * s, darkWood, -0.35 * s, 0.66 * s, 0.3 * s, 0, 0, 0.4)
  box(grp, 0.16 * s, 0.5 * s, 0.16 * s, darkWood, -0.35 * s, 0.66 * s, -0.3 * s, 0, 0, 0.4)
  const arm = box(grp, 1.3 * s, 0.12 * s, 0.14 * s, wood, 0.1 * s, 0.85 * s, 0, 0, 0, 0.5)
  const bucket = box(grp, 0.3 * s, 0.14 * s, 0.3 * s, darkWood, 0.62 * s, 1.16 * s, 0)
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 * s, 0), lamb(0x8d8d8d))
  rock.position.set(0.62 * s, 1.3 * s, 0)
  rock.castShadow = true
  grp.add(rock)
  box(grp, 0.04 * s, 0.5 * s, 0.04 * s, darkWood, -0.62 * s, 0.72 * s, 0)
  box(grp, 0.26 * s, 0.18 * s, 0.02 * s, lamb(teamColor), -0.62 * s, 0.98 * s, 0.02 * s) // team flag
  return grp
}

// ---- renderer ---------------------------------------------------------------------

export class Renderer {
  constructor(canvas, game) {
    this.game = game
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xa5cfe8) // cozy sky
    this.scene.fog = new THREE.Fog(0xa5cfe8, 190, 420)

    this.camera = new THREE.PerspectiveCamera(46, 1, 1, 700)
    const s0 = game.spawns?.[0] ?? [-MAP / 2 + 26, MAP / 2 - 26]
    this.camTarget = new THREE.Vector3(s0[0], 0, s0[1])
    this.camDist = 62
    this.updateCamera()

    const sun = new THREE.DirectionalLight(0xfff2d8, 2.6)
    sun.position.set(60, 95, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = 120
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc
    sun.shadow.camera.far = 320
    sun.shadow.bias = -0.0004
    this.sun = sun
    this.scene.add(sun, sun.target)
    this.scene.add(new THREE.HemisphereLight(0xbfd9f2, 0x5a7a48, 1.15))

    this.buildGround()
    this.buildScenery()
    this.buildFog()

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
      this.sun.position.set(t.x + 60, 95, t.z + 30)
      this.sun.target.position.set(t.x, 0, t.z)
    }
  }

  // ---- environment ---------------------------------------------------------------

  buildGround() {
    // seeded cozy meadow: flat greens with soft patches
    const rnd = (() => { let a = this.game.seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()
    const S = 2048
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#79aa5e'
    ctx.fillRect(0, 0, S, S)
    const tones = ['133,180,105', '112,160,88', '145,190,115', '104,150,84', '125,172,98']
    for (let i = 0; i < 180; i++) {
      const x = rnd() * S, y = rnd() * S, r = 90 + rnd() * 240
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(${tones[i % tones.length]},0.5)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // flower speckles
    for (let i = 0; i < 1400; i++) {
      const roll = rnd()
      ctx.fillStyle = roll < 0.5 ? 'rgba(240,240,210,0.32)' : roll < 0.75 ? 'rgba(240,180,200,0.3)' : 'rgba(250,215,120,0.3)'
      ctx.beginPath()
      ctx.arc(rnd() * S, rnd() * S, 1.1 + rnd() * 1.5, 0, 7)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP + 40, MAP + 40),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
  }

  buildScenery() {
    const g = this.game
    for (const o of g.obstacles) {
      const name = MODELS.scenery.mountain[o.variant % MODELS.scenery.mountain.length]
      const m = modelInstance(name, o.r * 2.4)
      m.position.set(o.x, 0, o.z)
      m.rotation.y = o.rot
      this.scene.add(m)
    }
    for (const d of g.decor) {
      const list = MODELS.scenery[d.model]
      if (!list) continue
      const name = list[d.variant % list.length]
      const m = modelInstance(name, (d.model === 'windmill' ? 6.5 : d.model === 'rock' ? 2.2 : 1.4) * d.scale)
      m.position.set(d.x, 0, d.z)
      m.rotation.y = d.rot
      this.scene.add(m)
    }
  }

  // ---- fog of war ------------------------------------------------------------------

  buildFog() {
    const f = this.game.fog
    const n = f.n
    const c = document.createElement('canvas')
    c.width = c.height = n
    const ctx = c.getContext('2d')
    const tex = new THREE.CanvasTexture(c)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP, MAP), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.35
    mesh.renderOrder = 3
    this.scene.add(mesh)
    this.fogCanvas = c
    this.fogCtx = ctx
    this.fogImage = ctx.createImageData(n, n)
    this.fogTex = tex
    this.fogMesh = mesh
    this.updateFogTexture()
  }

  updateFogTexture() {
    const f = this.game.fog
    const d = this.fogImage.data
    for (let i = 0; i < f.vis.length; i++) {
      const a = f.vis[i] ? 0 : f.seen[i] ? 105 : 232 // clear / explored-dim / unexplored
      const o = i * 4
      d[o] = 8; d[o + 1] = 16; d[o + 2] = 13; d[o + 3] = a
    }
    this.fogCtx.putImageData(this.fogImage, 0, 0)
    this.fogTex.needsUpdate = true
  }

  // enemy units only while in sight; buildings & resources persist once explored
  entityVisible(e) {
    const f = this.game.fog
    if (!f || !f.enabled) return true
    if (e.owner === this.game.localPlayer) return true
    if (e.kind === 'unit') return isVisible(this.game, e.x, e.z)
    return isExplored(this.game, e.x, e.z)
  }

  // ---- sync ------------------------------------------------------------------------

  sync() {
    const g = this.game
    for (const ev of g.events) {
      if (ev.type === 'spawn') {
        const e = g.entities.get(ev.id)
        if (e && !this.meshes.has(ev.id)) this.meshes.set(ev.id, this.buildMesh(e))
      } else if (ev.type === 'death') {
        const grp = this.meshes.get(ev.id)
        if (grp) {
          this.scene.remove(grp)
          this.meshes.delete(ev.id)
          this.deathFx(ev.x, ev.z, ev.kind)
        }
      } else if (ev.type === 'depleted') {
        const e = g.entities.get(ev.id)
        if (e && e.rtype === 'wood') this.rebuildMesh(e) // swap to cut stumps
      } else if (ev.type === 'ageup') {
        each(g, (e) => { if (e.kind === 'building' && e.owner === ev.owner) this.rebuildMesh(e) })
      } else if (ev.type === 'shot') {
        this.shotFx(ev)
      }
    }

    // fog of war: refresh the shroud texture and toggle the overlay
    const fog = g.fog
    if (fog) {
      this.fogMesh.visible = fog.enabled
      if (fog.enabled && fog.dirty) { this.updateFogTexture(); fog.dirty = false }
    }

    const t = performance.now() / 1000
    for (const [id, grp] of this.meshes) {
      const e = g.entities.get(id)
      if (!e || e.dead) { this.scene.remove(grp); this.meshes.delete(id); continue }
      grp.visible = this.entityVisible(e)
      const ud = grp.userData
      if (e.kind === 'unit') {
        const moved = Math.hypot(e.x - (ud.px ?? e.x), e.z - (ud.pz ?? e.z))
        ud.walk = (ud.walk ?? 0) + moved * 2.4
        ud.px = e.x; ud.pz = e.z
        const hop = Math.abs(Math.sin(ud.walk * 3)) * Math.min(0.14, moved * 55)
        grp.position.set(e.x, hop, e.z)
        grp.rotation.y = -e.rot + Math.PI / 2
        if (ud.armL) {
          const swing = Math.sin(ud.walk * 3) * Math.min(0.7, 0.2 + moved * 120)
          ud.armL.rotation.x = swing
          ud.armR.rotation.x = -swing
        }
        if (ud.carryW) {
          ud.carryW.visible = e.carry?.type === 'w'
          ud.carryG.visible = e.carry?.type === 'g'
        }
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
      if (ud.flag) ud.flag.rotation.y = Math.sin(t * 1.6 + id) * 0.25
    }

    const now = performance.now()
    this.effects = this.effects.filter((fx) => {
      const k = (now - fx.t0) / fx.dur
      if (k >= 1) { this.scene.remove(fx.obj); return false }
      fx.update?.(k)
      return true
    })
  }

  rebuildMesh(e) {
    const old = this.meshes.get(e.id)
    if (old) this.scene.remove(old)
    this.meshes.set(e.id, this.buildMesh(e))
  }

  // ---- entity meshes -----------------------------------------------------------------

  buildMesh(e) {
    const grp = new THREE.Group()
    grp.position.set(e.x, 0, e.z)
    grp.userData.entityId = e.id

    if (e.kind === 'resource') {
      grp.add(this.resourceMesh(e))
      grp.rotation.y = e.rot || 0
    } else if (e.kind === 'building') {
      const body = modelInstance(buildingModelName(e.protoId, e.age), MODEL_FOOTPRINT[e.protoId])
      grp.add(body)
      // team banner
      const color = PLAYER_COLORS[e.owner]
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), lamb(0x6a4e30))
      pole.position.set(e.proto.radius * 0.75, 1.3, e.proto.radius * 0.75)
      grp.add(pole)
      const flag = box(grp, 0.9, 0.55, 0.04, lamb(color), e.proto.radius * 0.75 + 0.45, 2.35, e.proto.radius * 0.75)
      grp.userData.flag = flag
    } else {
      const built = e.protoId === 'catapult'
        ? { grp: makeCatapult(PLAYER_COLORS[e.owner], e.proto.radius) }
        : makePerson(e.protoId, PLAYER_COLORS[e.owner], e.proto.radius)
      grp.add(built.grp)
      grp.userData.armL = built.armL
      grp.userData.armR = built.armR
      grp.userData.carryW = built.grp.userData?.carryW
      grp.userData.carryG = built.grp.userData?.carryG
    }

    if (e.kind !== 'resource') {
      const rad = (e.proto.radius || 1) + 0.35
      const ringCol = PLAYER_COLORS[e.owner]
      const own = new THREE.Mesh(
        new THREE.RingGeometry(rad - 0.09, rad, 40),
        new THREE.MeshBasicMaterial({ color: ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.28 })
      )
      own.rotation.x = -Math.PI / 2
      own.position.y = 0.05
      grp.add(own)
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
    }
    grp.traverse((m) => { if (m.isMesh && !m.isSprite) m.receiveShadow = true })
    this.scene.add(grp)
    return grp
  }

  resourceMesh(e) {
    if (e.rtype === 'wood') {
      const set = e.pine ? MODELS.resources.pine : MODELS.resources.tree
      return modelInstance(set[e.depletedVisual ? 1 : 0], e.radius * 2.6)
    }
    const name = MODELS.resources.gold[e.variant % MODELS.resources.gold.length]
    return modelInstance(name, e.radius * 2.3)
  }

  barHeight(e) {
    if (e.kind === 'building') return e.proto.radius * 1.15 + 2.4
    return e.proto.radius * 2 + 1.7
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
    const full = e.hp >= e.maxHp && !e.constructing
    sprite.visible = e.selected || !full
    if (!sprite.visible) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 96, 14)
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(0, 0, 96, 14)
    if (e.constructing) {
      ctx.fillStyle = '#e8b83a'
      ctx.fillRect(1, 1, Math.round(94 * e.progress), 12)
    } else {
      const hpF = Math.max(0, e.hp / e.maxHp)
      ctx.fillStyle = hpF > 0.6 ? '#46d160' : hpF > 0.3 ? '#e8b83a' : '#e0452f'
      ctx.fillRect(1, 1, Math.round(94 * hpF), 12)
    }
    tex.needsUpdate = true
  }

  // ---- ghost placement preview ------------------------------------------------------

  setGhost(protoId) {
    this.clearGhost()
    const proto = BUILDINGS[protoId]
    const body = modelInstance(buildingModelName(protoId, this.game.players[this.game.localPlayer].age), MODEL_FOOTPRINT[protoId])
    const grp = new THREE.Group()
    grp.add(body)
    grp.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone()
        m.material.transparent = true
        m.material.opacity = 0.55
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

  // ---- combat effects -----------------------------------------------------------------

  shotFx(ev) {
    const d = Math.hypot(ev.to.x - ev.from.x, ev.to.z - ev.from.z)
    const proto = ev.srcProto
    if (proto === 'catapult') {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), lamb(0x8d8d8d))
      this.scene.add(rock)
      const { from, to } = ev
      this.effects.push({
        obj: rock, t0: performance.now(), dur: 160 + d * 22,
        update: (t) => {
          rock.position.set(
            from.x + (to.x - from.x) * t,
            1.4 + Math.sin(t * Math.PI) * 7,
            from.z + (to.z - from.z) * t
          )
          rock.rotation.x += 0.2
          if (t > 0.94) this.impact(to.x, to.z, 0xd8a25c, 1.8)
        },
      })
      return
    }
    if (d >= 3) {
      // arrow
      const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.7), lamb(0x5a4630))
      this.scene.add(arrow)
      const { from, to } = ev
      arrow.position.set(from.x, 1.6, from.z)
      arrow.lookAt(to.x, 1.0, to.z)
      this.effects.push({
        obj: arrow, t0: performance.now(), dur: 70 + d * 13,
        update: (t) => {
          arrow.position.set(
            from.x + (to.x - from.x) * t,
            1.6 + Math.sin(t * Math.PI) * 1.4,
            from.z + (to.z - from.z) * t
          )
          if (t > 0.92) this.impact(to.x, to.z, 0xf0e0b0, 0.7)
        },
      })
      return
    }
    this.impact(ev.to.x, ev.to.z, 0xfff0c8, 0.8)
  }

  impact(x, z, color, scale = 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.35, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.15, z)
    this.scene.add(ring)
    this.effects.push({
      obj: ring, t0: performance.now(), dur: 260,
      update: (t) => { ring.scale.setScalar((1 + t * 3.5) * scale); ring.material.opacity = 0.8 * (1 - t) },
    })
  }

  deathFx(x, z, kind) {
    const big = kind === 'building'
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 1.6 : 0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: big ? 0xe8b070 : 0xd8d8d8, transparent: true, opacity: 0.7 })
    )
    s.position.set(x, 1, z)
    this.scene.add(s)
    this.effects.push({
      obj: s, t0: performance.now(), dur: big ? 700 : 400,
      update: (t) => { s.scale.setScalar(1 + t * (big ? 3 : 2)); s.material.opacity = 0.7 * (1 - t) },
    })
  }

  // ---- picking --------------------------------------------------------------------------

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
