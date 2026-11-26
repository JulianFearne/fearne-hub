// src/pages/games/emberdelve/scene.js
// Draws an Emberdelve game with three.js. It only reads the game state; all
// the rules are in engine.js. Everything is low-poly flat shading with a
// single warm point light carried by the player, so it stays light enough for
// a phone: no real shadows (soft blob textures instead), instanced meshes for
// anything there are lots of, and a pixel ratio capped at 2.

import * as THREE from 'three'
import { REWARDS, THEME_NAMES, WORLD } from './engine'

const { ROOM_W, ROOM_D, HALF_W, HALF_D, DOOR_W } = WORLD
const DOOR_XS = [-3, 0, 3]
const WALL_H = 1.7
const WALL_T = 0.7

// One palette per stretch of five rooms; it changes after each boss.
const THEMES = [
  { name: THEME_NAMES[0], floor: 0x6b6470, wall: 0x423a4c, fog: 0x0f0c14, hemi: 0x8a7fa0 },
  { name: THEME_NAMES[1], floor: 0x56664f, wall: 0x2f3d2c, fog: 0x08110a, hemi: 0x7fa07a },
  { name: THEME_NAMES[2], floor: 0x667888, wall: 0x36465a, fog: 0x08101c, hemi: 0x8fb0d0 },
  { name: THEME_NAMES[3], floor: 0x7a5546, wall: 0x4a2a20, fog: 0x160805, hemi: 0xc08a70 },
]

const REWARD_STYLE = {
  boon: { color: 0x7fd4ff, glyph: '✦' },
  rest: { color: 0x7dff9a, glyph: '♥' },
  elite: { color: 0xffc94a, glyph: '☠' },
  boss: { color: 0xff5a5a, glyph: '♛' },
  shop: { color: 0xffd27f, glyph: '◆' },
}

// ---------------------------------------------------------------- textures

function canvasTexture(size, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function floorTexture() {
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = '#bbb'
    g.fillRect(0, 0, s, s)
    const n = 4
    const cell = s / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 170 + Math.floor(Math.random() * 60)
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6)
        // A few scuffs and cracks.
        for (let k = 0; k < 6; k++) {
          const d = 120 + Math.floor(Math.random() * 50)
          g.fillStyle = `rgba(${d},${d},${d},0.35)`
          g.fillRect(x * cell + Math.random() * cell, y * cell + Math.random() * cell, 2 + Math.random() * 6, 2 + Math.random() * 3)
        }
      }
    }
    g.strokeStyle = 'rgba(60,60,60,0.9)'
    g.lineWidth = 4
    for (let i = 0; i <= n; i++) {
      g.beginPath()
      g.moveTo(i * cell, 0)
      g.lineTo(i * cell, s)
      g.moveTo(0, i * cell)
      g.lineTo(s, i * cell)
      g.stroke()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(ROOM_W / 4, ROOM_D / 4)
  t.anisotropy = 4
  return t
}

function blobTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(0,0,0,0.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })
}

function glowTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })
}

function labelTexture(reward) {
  const style = REWARD_STYLE[reward]
  const hex = `#${style.color.toString(16).padStart(6, '0')}`
  return canvasTexture(256, (g, s) => {
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = hex
    g.shadowBlur = 18
    g.fillStyle = hex
    g.font = 'bold 110px system-ui, sans-serif'
    g.fillText(style.glyph, s / 2, s * 0.38)
    g.shadowBlur = 8
    g.fillStyle = '#fff'
    g.font = 'bold 52px system-ui, sans-serif'
    g.fillText(REWARDS[reward].label.toUpperCase(), s / 2, s * 0.8)
  })
}

// ---------------------------------------------------------------- builders

function heartGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.5)
  s.bezierCurveTo(-0.6, -0.05, -0.55, 0.45, 0, 0.2)
  s.bezierCurveTo(0.55, 0.45, 0.6, -0.05, 0, -0.5)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false })
  g.center()
  return g
}

function makeFoe(kind, elite) {
  const group = new THREE.Group()
  const mats = []
  const mat = (color, opts = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts })
    mats.push(m)
    return m
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 })
  const eyes = (r, y, spread, size = 0.07) => {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), eyeMat)
      e.position.set(s * spread, y, r * 0.92)
      group.add(e)
    }
  }
  let body
  switch (kind) {
    case 'mite':
      body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat(0x6a3fb0))
      body.position.y = 0.42
      body.scale.y = 0.85
      group.add(body)
      eyes(0.34, 0.5, 0.12)
      break
    case 'wisp':
      body = new THREE.Mesh(new THREE.TetrahedronGeometry(0.34, 0), mat(0x3fd0e0, { emissive: 0x1a6a80 }))
      body.position.y = 0.7
      group.add(body)
      break
    case 'spitter':
      body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 7), mat(0x5aa83c))
      body.position.y = 0.45
      group.add(body)
      {
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 5, 8), new THREE.MeshBasicMaterial({ color: 0xff4fd8 }))
        mouth.position.set(0, 0.42, 0.33)
        group.add(mouth)
      }
      eyes(0.3, 0.62, 0.1, 0.06)
      break
    case 'brute':
      body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 0.9), mat(0x9a4a32))
      body.position.y = 0.55
      group.add(body)
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), mat(0xe8dcc0))
        horn.position.set(s * 0.42, 1.15, 0.1)
        horn.rotation.z = -s * 0.5
        group.add(horn)
      }
      eyes(0.5, 0.75, 0.22, 0.09)
      break
    case 'splitter':
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), mat(0xd0508a))
      body.position.y = 0.6
      group.add(body)
      eyes(0.5, 0.68, 0.16)
      break
    case 'boss': {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), mat(0x5a1622, { emissive: 0x200408 }))
      body.position.y = 1.4
      group.add(body)
      const crown = new THREE.Group()
      const gold = mat(0xe0b040, { emissive: 0x402800 })
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 4), gold)
        const a = (i / 7) * Math.PI * 2
        spike.position.set(Math.cos(a) * 0.75, 2.6, Math.sin(a) * 0.75)
        crown.add(spike)
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.12, 5, 14), gold)
      band.rotation.x = Math.PI / 2
      band.position.y = 2.35
      crown.add(band)
      group.add(crown)
      group.userData.crown = crown
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5050 }))
        e.position.set(s * 0.4, 1.6, 1.12)
        group.add(e)
      }
      break
    }
  }
  if (elite) {
    for (const m of mats) m.emissive = new THREE.Color(0x4a3300)
    group.scale.setScalar(1.15)
  }
  group.userData.body = body
  group.userData.mats = mats
  group.userData.baseEmissive = mats.map((m) => m.emissive.clone())
  return group
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of ms) m.dispose()
    }
  })
}

// ---------------------------------------------------------------- scene

export function createScene(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' })
  renderer.setPixelRatio(dpr)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(THEMES[0].fog)
  scene.fog = new THREE.Fog(THEMES[0].fog, 16, 40)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 80)
  const camTarget = new THREE.Vector3(0, 0, 0)
  let camDist = 20
  let camHalfW = 5

  const hemi = new THREE.HemisphereLight(THEMES[0].hemi, 0x2a2018, 2.2)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffe8d0, 1.1)
  sun.position.set(-4, 10, 6)
  scene.add(sun)

  const blobTex = blobTexture()
  const glowTex = glowTexture()

  // Floor and walls.
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTexture(), color: THEMES[0].floor })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  // A dark skirt beyond the room so the fog has something to fade into.
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0x050407 }))
  skirt.rotation.x = -Math.PI / 2
  skirt.position.y = -0.6
  scene.add(skirt)

  const wallMat = new THREE.MeshLambertMaterial({ color: THEMES[0].wall, flatShading: true })
  const capMat = new THREE.MeshLambertMaterial({ color: 0x8a8090, flatShading: true })
  const walls = new THREE.Group()
  function wallBox(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat)
    m.position.set(x, WALL_H / 2, z)
    walls.add(m)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.14, d + 0.08), capMat)
    cap.position.set(x, WALL_H + 0.07, z)
    walls.add(cap)
  }
  wallBox(WALL_T, ROOM_D + WALL_T * 2, -HALF_W - WALL_T / 2, 0)
  wallBox(WALL_T, ROOM_D + WALL_T * 2, HALF_W + WALL_T / 2, 0)
  // The bottom wall is lower so it never hides the player at the entrance.
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.5, WALL_T), wallMat)
    m.position.set(0, 0.25, HALF_D + WALL_T / 2)
    walls.add(m)
  }
  // The top wall has three arches; a cleared room unseals one or two of them.
  {
    const edges = [-HALF_W, ...DOOR_XS.flatMap((x) => [x - DOOR_W / 2, x + DOOR_W / 2]), HALF_W]
    for (let i = 0; i < edges.length; i += 2) {
      const w = edges[i + 1] - edges[i]
      wallBox(w, WALL_T, (edges[i] + edges[i + 1]) / 2, -HALF_D - WALL_T / 2)
    }
    for (const x of DOOR_XS) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 0.4, WALL_T), wallMat)
      lintel.position.set(x, WALL_H - 0.2, -HALF_D - WALL_T / 2)
      walls.add(lintel)
    }
  }
  scene.add(walls)

  const sealMat = new THREE.MeshLambertMaterial({ color: 0x1c1820, flatShading: true })
  const doors = DOOR_XS.map((x) => {
    const seal = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, WALL_H - 0.4, WALL_T * 0.6), sealMat)
    seal.position.set(x, (WALL_H - 0.4) / 2, -HALF_D - WALL_T / 2)
    scene.add(seal)
    const portalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex })
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 1.3, WALL_H * 1.3), portalMat)
    portal.position.set(x, (WALL_H - 0.4) / 2, -HALF_D - 0.1)
    portal.visible = false
    scene.add(portal)
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 1.6, 2.4), portalMat.clone())
    floorGlow.rotation.x = -Math.PI / 2
    floorGlow.position.set(x, 0.02, -HALF_D + 0.9)
    floorGlow.visible = false
    scene.add(floorGlow)
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }))
    label.scale.set(2.2, 2.2, 1)
    label.position.set(x, WALL_H + 1.3, -HALF_D - 0.2)
    label.visible = false
    scene.add(label)
    return { x, seal, portal, floorGlow, label, reward: null }
  })
  const labelTextures = {}
  const labelFor = (r) => (labelTextures[r] ??= labelTexture(r))

  // Wall torches: emissive flames only, the room light comes from the player.
  const torchFlameMat = new THREE.MeshBasicMaterial({ color: 0xffa030 })
  const torches = []
  for (const side of [-1, 1]) {
    for (const z of [-5, 3]) {
      const t = new THREE.Group()
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), capMat)
      t.add(stick)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), torchFlameMat)
      flame.position.y = 0.35
      t.add(flame)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9030, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
      glow.scale.set(1.6, 1.6, 1)
      glow.position.y = 0.4
      t.add(glow)
      t.position.set(side * (HALF_W - 0.05), 1.1, z)
      scene.add(t)
      torches.push({ flame, glow, seed: Math.random() * 10 })
    }
  }

  // Pillars, rebuilt each room.
  const pillarGroup = new THREE.Group()
  scene.add(pillarGroup)
  const pillarGeo = new THREE.CylinderGeometry(1, 1.1, 1, 6)
  const pillarCapGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.18, 6)
  const blobGeo = new THREE.PlaneGeometry(1, 1)
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })

  function blob(size) {
    const b = new THREE.Mesh(blobGeo, blobMat)
    b.rotation.x = -Math.PI / 2
    b.position.y = 0.015
    b.scale.set(size, size, 1)
    return b
  }

  // The player: a little candle with a living flame.
  const player = new THREE.Group()
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.7, 10), new THREE.MeshLambertMaterial({ color: 0xf4ead2 }))
  wax.position.y = 0.35
  player.add(wax)
  const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0xe8d8b0 }))
  drip.position.y = 0.66
  player.add(drip)
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 4), new THREE.MeshBasicMaterial({ color: 0x221a10 }))
  wick.position.y = 0.76
  player.add(wick)
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2a }))
  flameOuter.position.y = 1.02
  player.add(flameOuter)
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }))
  flameInner.position.y = 0.96
  player.add(flameInner)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
  halo.scale.set(1.8, 1.8, 1)
  halo.position.y = 1
  player.add(halo)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: 0x2a1a10 }))
    eye.position.set(s * 0.09, 0.48, 0.27)
    player.add(eye)
  }
  const lamp = new THREE.PointLight(0xffa850, 40, 12, 1.3)
  lamp.position.y = 1.4
  player.add(lamp)
  scene.add(player)
  const playerBlob = blob(1.1)
  scene.add(playerBlob)
  // Ring on the floor that fills in as the dash recharges.
  const dashRingMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.7, depthWrite: false })
  let dashRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.65, 32), dashRingMat)
  dashRing.rotation.x = -Math.PI / 2
  dashRing.position.y = 0.03
  scene.add(dashRing)
  let dashRingFrac = 1

  // Instanced pools.
  const dummy = new THREE.Object3D()
  function pool(geo, mat, count) {
    const m = new THREE.InstancedMesh(geo, mat, count)
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.count = 0
    m.frustumCulled = false
    scene.add(m)
    return m
  }
  const additive = (color, opacity = 0.9) =>
    new THREE.MeshBasicMaterial({ color, map: glowTex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  const glowGeo = new THREE.PlaneGeometry(1, 1)

  const shotCore = pool(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), 300)
  const shotGlow = pool(glowGeo, additive(0xff9a30), 300)
  const boltCore = pool(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff80e8 }), 400)
  const boltGlow = pool(glowGeo, additive(0xd040ff), 400)
  const emberMesh = pool(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xffc040 }), 400)
  const heartMesh = pool(heartGeometry(), new THREE.MeshLambertMaterial({ color: 0xff4060, emissive: 0x601020 }), 20)
  const orbCore = pool(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8f4ff }), 8)
  const orbGlow = pool(glowGeo, additive(0x60c8ff), 8)
  const sparks = pool(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 300)
  sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3)
  // Burning ground (Firewalk) and explosion rings. Additive, so fading a
  // ring's colour to black fades it out.
  const floorGlowGeo = new THREE.PlaneGeometry(1, 1)
  floorGlowGeo.rotateX(-Math.PI / 2)
  const hazardMesh = pool(floorGlowGeo, additive(0xff6a1a, 0.85), 200)
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40)
  ringGeo.rotateX(-Math.PI / 2)
  const ringMesh = pool(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 40)
  ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3)
  // Wax Ward: a soft bubble while a shield charge is up.
  const wardMat = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  const wardBubble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), wardMat)
  scene.add(wardBubble)
  const spawnRings = pool(new THREE.RingGeometry(0.4, 0.55, 24), new THREE.MeshBasicMaterial({ color: 0xb080ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), 40)

  const foeMeshes = new Map() // enemy id -> { group, blob }
  let builtRoom = null
  let themeIndex = -1
  const tmpColor = new THREE.Color()
  const camQuat = new THREE.Quaternion()

  function applyTheme(i) {
    if (i === themeIndex) return
    themeIndex = i
    const t = THEMES[i]
    floorMat.color.setHex(t.floor)
    wallMat.color.setHex(t.wall)
    scene.background.setHex(t.fog)
    scene.fog.color.setHex(t.fog)
    hemi.color.setHex(t.hemi)
  }

  function buildRoomMeshes(room) {
    for (const c of [...pillarGroup.children]) {
      pillarGroup.remove(c)
    }
    for (const p of room.pillars) {
      const h = 1.4 + Math.random() * 0.8
      const col = new THREE.Mesh(pillarGeo, wallMat)
      col.scale.set(p.r * 0.9, h, p.r * 0.9)
      col.position.set(p.x, h / 2, p.z)
      pillarGroup.add(col)
      const cap = new THREE.Mesh(pillarCapGeo, capMat)
      cap.scale.set(p.r * 0.9, 1, p.r * 0.9)
      cap.position.set(p.x, h + 0.09, p.z)
      pillarGroup.add(cap)
      const b = blob(p.r * 3)
      pillarGroup.add(b)
      b.position.x = p.x
      b.position.z = p.z
    }
    for (const [, m] of foeMeshes) {
      scene.remove(m.group)
      scene.remove(m.blob)
      disposeTree(m.group)
    }
    foeMeshes.clear()
    applyTheme(room.theme)
    camTarget.z = 5
    camTarget.x = 0
  }

  function resize(w, h) {
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Show about nine metres across on a phone held upright, so the candle is
    // big enough to read; the camera slides sideways to follow it.
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hHalf = Math.atan(Math.tan(vfov / 2) * camera.aspect)
    camDist = THREE.MathUtils.clamp(9 / 2 / Math.tan(hHalf), 11, 20)
    camHalfW = camDist * Math.tan(hHalf)
    camera.updateProjectionMatrix()
  }

  function render(game, now) {
    const t = now / 1000
    const room = game.room
    if (room !== builtRoom) {
      builtRoom = room
      buildRoomMeshes(room)
    }
    const p = game.player

    // Camera: tilted down at ~58 degrees, following the player along the room.
    const tilt = THREE.MathUtils.degToRad(58)
    const visibleHalfD = camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.9
    const span = Math.max(0, HALF_D - visibleHalfD + 1.5)
    const wantZ = THREE.MathUtils.clamp(p.z - 0.5, -span, span)
    camTarget.z += (wantZ - camTarget.z) * 0.08
    const spanX = Math.max(0, HALF_W + 0.8 - camHalfW)
    const wantX = THREE.MathUtils.clamp(p.x * 0.8, -spanX, spanX)
    camTarget.x += (wantX - camTarget.x) * 0.08
    const sh = game.shake * 0.35
    camera.position.set(
      camTarget.x + (Math.random() - 0.5) * sh,
      Math.sin(tilt) * camDist + (Math.random() - 0.5) * sh,
      camTarget.z + Math.cos(tilt) * camDist,
    )
    camera.lookAt(camTarget.x, 0, camTarget.z)
    camQuat.copy(camera.quaternion)

    // Player.
    const alive = game.status !== 'dying' && game.status !== 'over'
    player.visible = alive && !(p.inv > 0 && Math.floor(t * 16) % 2 === 0 && p.dashing <= 0)
    player.position.set(p.x, Math.abs(Math.sin(t * 9)) * Math.min(1, Math.hypot(p.vx, p.vz) / 3) * 0.08, p.z)
    player.rotation.y = Math.atan2(p.fx, p.fz)
    const flick = 1 + Math.sin(t * 23) * 0.06 + Math.sin(t * 37) * 0.04
    const fury = 1 + (p.furyStacks || 0) * 0.08
    flameOuter.scale.set(fury, flick * fury * (p.dashing > 0 ? 1.4 : 1), fury)
    flameOuter.material.color.setHex(p.furyStacks ? 0xff5a20 : 0xff9a2a)
    wardBubble.visible = alive && p.ward > 0
    wardBubble.position.set(p.x, 0.55, p.z)
    wardMat.opacity = 0.18 + Math.sin(t * 5) * 0.05
    flameInner.scale.set(1, flick, 1)
    lamp.intensity = alive ? 40 * flick : 0
    halo.material.opacity = 0.65 * flick
    playerBlob.visible = alive
    playerBlob.position.set(p.x, 0.015, p.z)
    const frac = 1 - p.dashT / p.dashCd
    if (Math.abs(frac - dashRingFrac) > 0.02 || (frac >= 1 && dashRingFrac < 1)) {
      dashRingFrac = frac >= 1 ? 1 : frac
      dashRing.geometry.dispose()
      dashRing.geometry = new THREE.RingGeometry(0.55, 0.65, 32, 1, Math.PI / 2, Math.PI * 2 * Math.max(0.001, dashRingFrac))
    }
    dashRing.visible = alive
    dashRing.position.set(p.x, 0.03, p.z)
    dashRingMat.opacity = dashRingFrac >= 1 ? 0.75 : 0.35

    // Foes: add new ones, update, drop the dead.
    const seen = new Set()
    for (const e of game.enemies) {
      seen.add(e.id)
      let m = foeMeshes.get(e.id)
      if (!m) {
        m = { group: makeFoe(e.kind, e.elite), blob: blob(e.r * 2.6) }
        scene.add(m.group)
        scene.add(m.blob)
        foeMeshes.set(e.id, m)
      }
      const g = m.group
      g.position.set(e.x, 0, e.z)
      g.rotation.y = Math.atan2(p.x - e.x, p.z - e.z)
      const body = g.userData.body
      if (e.kind === 'wisp') {
        body.rotation.y = t * 6 + e.id
        body.position.y = 0.7 + Math.sin(t * 5 + e.id) * 0.12
      } else if (e.kind === 'mite') {
        body.position.y = 0.42 + Math.abs(Math.sin(t * 10 + e.id)) * 0.12
      } else if (e.kind === 'splitter') {
        const s = 1 + Math.sin(t * 6 + e.id) * 0.08
        body.scale.set(s, 1 / s, s)
      } else if (e.kind === 'spitter') {
        const charge = Math.max(0, e.t - 1.7) / 0.5
        body.scale.set(1 + charge * 0.2, 1 - charge * 0.15, 1 + charge * 0.2)
      } else if (e.kind === 'brute') {
        if (e.state === 'wind') g.position.x += Math.sin(t * 60) * 0.06
        g.rotation.x = e.state === 'charge' ? 0.25 : 0
        if (e.state === 'charge' || e.state === 'wind') g.rotation.y = Math.atan2(e.cx, e.cz)
      } else if (e.kind === 'boss') {
        body.rotation.y = t * 0.6
        body.position.y = 1.4 + Math.sin(t * 2) * 0.15
        g.userData.crown.rotation.y = -t * 0.8
        g.userData.crown.position.y = Math.sin(t * 2) * 0.15
      }
      const mats = g.userData.mats
      const burning = e.burn > 0
      const chilled = e.chill > 0
      for (let i = 0; i < mats.length; i++) {
        if (e.hit > 0) mats[i].emissive.setHex(0xffffff)
        else if (burning) mats[i].emissive.setHex(0x6a2000)
        else if (chilled) mats[i].emissive.setHex(0x1a4a80)
        else mats[i].emissive.copy(g.userData.baseEmissive[i])
      }
      m.blob.position.set(e.x, 0.015, e.z)
    }
    for (const [id, m] of foeMeshes) {
      if (!seen.has(id)) {
        scene.remove(m.group)
        scene.remove(m.blob)
        disposeTree(m.group)
        foeMeshes.delete(id)
      }
    }

    // Shots, bolts, pickups, orbs, sparks.
    const face = (mesh, i, x, y, z, s) => {
      dummy.position.set(x, y, z)
      dummy.quaternion.copy(camQuat)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    const put = (mesh, i, x, y, z, s, ry = 0) => {
      dummy.position.set(x, y, z)
      dummy.rotation.set(0, ry, 0)
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    const n = Math.min(game.shots.length, 300)
    for (let i = 0; i < n; i++) {
      const s = game.shots[i]
      put(shotCore, i, s.x, 0.55, s.z, (s.crit ? 1.5 : 1) * s.size)
      face(shotGlow, i, s.x, 0.55, s.z, (s.crit ? 1.3 : 0.85) * s.size)
    }
    shotCore.count = shotGlow.count = n
    const nb = Math.min(game.bolts.length, 400)
    for (let i = 0; i < nb; i++) {
      const b = game.bolts[i]
      put(boltCore, i, b.x, 0.55, b.z, 1)
      face(boltGlow, i, b.x, 0.55, b.z, 0.95 + Math.sin(t * 12 + i) * 0.1)
    }
    boltCore.count = boltGlow.count = nb
    let ne = 0
    let nh = 0
    for (const k of game.pickups) {
      if (k.kind === 'ember' && ne < 400) put(emberMesh, ne++, k.x, 0.3 + Math.sin(t * 6 + k.x) * 0.06, k.z, 1, t * 4)
      else if (k.kind === 'heart' && nh < 20) put(heartMesh, nh++, k.x, 0.45 + Math.sin(t * 4) * 0.08, k.z, 0.7, t * 2)
    }
    emberMesh.count = ne
    heartMesh.count = nh
    let no = 0
    if (alive) {
      for (let i = 0; i < p.orbs && i < 8; i++) {
        const a = p.orbAngle + (i / p.orbs) * Math.PI * 2
        const ox = p.x + Math.cos(a) * 1.5
        const oz = p.z + Math.sin(a) * 1.5
        put(orbCore, no, ox, 0.6, oz, 1)
        face(orbGlow, no, ox, 0.6, oz, 1.4)
        no++
      }
    }
    orbCore.count = orbGlow.count = no
    const np = Math.min(game.particles.length, 300)
    for (let i = 0; i < np; i++) {
      const q = game.particles[i]
      put(sparks, i, q.x, q.y, q.z, Math.max(0.2, q.life / q.max) * 1.2, q.x * 3)
      sparks.setColorAt(i, tmpColor.setHex(q.color))
    }
    sparks.count = np
    if (np) sparks.instanceColor.needsUpdate = true
    const ns = Math.min(game.spawns.length, 40)
    for (let i = 0; i < ns; i++) {
      const s = game.spawns[i]
      dummy.position.set(s.x, 0.04, s.z)
      dummy.rotation.set(-Math.PI / 2, 0, t * 3)
      const big = s.kind === 'boss' ? 3 : s.kind === 'brute' ? 1.6 : 1
      dummy.scale.setScalar(big * (0.6 + (1 - s.t) * 0.7 + Math.sin(t * 14) * 0.05))
      dummy.updateMatrix()
      spawnRings.setMatrixAt(i, dummy.matrix)
    }
    spawnRings.count = ns
    const nh2 = Math.min(game.hazards.length, 200)
    for (let i = 0; i < nh2; i++) {
      const h = game.hazards[i]
      const k = Math.min(1, h.t / 0.5)
      put(hazardMesh, i, h.x, 0.03, h.z, h.r * 2.4 * (0.85 + Math.sin(t * 9 + i) * 0.1) * k)
    }
    hazardMesh.count = nh2
    const nr = Math.min(game.rings.length, 40)
    for (let i = 0; i < nr; i++) {
      const r = game.rings[i]
      const f = r.t / r.max
      put(ringMesh, i, r.x, 0.06, r.z, r.r * (1.15 - f * 0.55))
      ringMesh.setColorAt(i, tmpColor.setHex(r.color).multiplyScalar(f))
    }
    ringMesh.count = nr
    if (nr) ringMesh.instanceColor.needsUpdate = true
    for (const mesh of [shotCore, shotGlow, boltCore, boltGlow, emberMesh, heartMesh, orbCore, orbGlow, sparks, spawnRings, hazardMesh, ringMesh]) {
      mesh.instanceMatrix.needsUpdate = true
    }

    // Doors.
    for (const d of doors) {
      const open = room.doors.find((o) => o.x === d.x)
      d.seal.visible = !open
      d.portal.visible = d.floorGlow.visible = d.label.visible = !!open
      if (open) {
        if (d.reward !== open.reward) {
          d.reward = open.reward
          const col = REWARD_STYLE[open.reward].color
          d.portal.material.color.setHex(col)
          d.floorGlow.material.color.setHex(col)
          d.label.material.map = labelFor(open.reward)
          d.label.material.needsUpdate = true
        }
        const pulse = 0.7 + Math.sin(t * 4 + d.x) * 0.2
        d.portal.material.opacity = pulse
        d.floorGlow.material.opacity = pulse * 0.6
        d.label.position.y = WALL_H + 1.3 + Math.sin(t * 3 + d.x) * 0.1
      } else d.reward = null
    }

    for (const tr of torches) {
      const f = 1 + Math.sin(t * 17 + tr.seed) * 0.12 + Math.sin(t * 29 + tr.seed) * 0.08
      tr.flame.scale.set(1, f, 1)
      tr.glow.material.opacity = 0.55 * f
    }

    renderer.render(scene, camera)
  }

  function dispose() {
    for (const [, m] of foeMeshes) disposeTree(m.group)
    disposeTree(scene)
    for (const tex of [blobTex, glowTex, ...Object.values(labelTextures)]) tex.dispose()
    renderer.dispose()
  }

  return { render, resize, dispose }
}
