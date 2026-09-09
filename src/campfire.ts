import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  TextShape,
  Billboard,
  VisibilityComponent,
  InputAction,
  pointerEventsSystem,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  FIRE_POS,
  FIRE_RANGE,
  MAX_FUEL,
  MAX_LEVEL,
  SEAT_COUNT,
  SEAT_RADIUS
} from './config'
import { CampfireState, local, now, setToast } from './state'
import { stateEntity, feedFire } from './sync'

const STONE = Color4.fromHexString('#5a5a5eff')
const LOG_DARK = Color4.fromHexString('#3b2a1cff')
const CHARRED = Color4.fromHexString('#1c1712ff')

let flameCore: Entity
let flameMid: Entity
let flameOuter: Entity
let glow: Entity
let statusLabel: Entity
const embers: { e: Entity; vy: number; life: number; ttl: number; shown: boolean }[] = []
const seatPositions: Vector3[] = []
const logEntities: Entity[] = []
let lastOut = false
let lastStatusKey = ''

let warmthRing: Entity
const bursts: { e: Entity; vx: number; vy: number; vz: number; life: number }[] = []
let celebrated = 0

function cone(color: Color4, emissive: Color3, alpha = 1): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(FIRE_POS.x, 0.4, FIRE_POS.z), scale: Vector3.One() })
  MeshRenderer.setCylinder(e, 0, 0.5)
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(color.r, color.g, color.b, alpha),
    emissiveColor: emissive,
    emissiveIntensity: 2.2,
    roughness: 1
  })
  return e
}

function buildFirePit(): void {
  // Stone ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const s = engine.addEntity()
    Transform.create(s, {
      position: Vector3.create(FIRE_POS.x + Math.cos(a) * 1.15, 0.18, FIRE_POS.z + Math.sin(a) * 1.15),
      scale: Vector3.create(0.4, 0.36, 0.4),
      rotation: Quaternion.fromEulerDegrees(0, (i * 40) % 360, 0)
    })
    MeshRenderer.setBox(s)
    Material.setPbrMaterial(s, { albedoColor: STONE, roughness: 1 })
  }

  // Teepee of logs
  const layout = [
    { x: 0.0, z: 0.35, rot: 24 },
    { x: 0.35, z: -0.15, rot: -140 },
    { x: -0.35, z: -0.15, rot: 140 },
    { x: 0.0, z: -0.4, rot: -24 }
  ]
  for (const l of layout) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(FIRE_POS.x + l.x, 0.42, FIRE_POS.z + l.z),
      scale: Vector3.create(0.16, 1.15, 0.16),
      rotation: Quaternion.fromEulerDegrees(l.rot, 0, 12)
    })
    MeshRenderer.setCylinder(e)
    Material.setPbrMaterial(e, { albedoColor: LOG_DARK, roughness: 1 })
    logEntities.push(e)
  }

  // Tap target for adding wood
  const hit = engine.addEntity()
  Transform.create(hit, { position: Vector3.create(FIRE_POS.x, 0.7, FIRE_POS.z), scale: Vector3.create(1.6, 1.4, 1.6) })
  MeshCollider.setBox(hit, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: hit, opts: { button: InputAction.IA_POINTER, hoverText: 'Add wood to the fire', maxDistance: FIRE_RANGE + 1 } },
    () => addWoodAction()
  )
}

function buildFlame(): void {
  glow = engine.addEntity()
  Transform.create(glow, { position: Vector3.create(FIRE_POS.x, 0.6, FIRE_POS.z), scale: Vector3.create(3, 3, 3) })
  MeshRenderer.setSphere(glow)
  Material.setPbrMaterial(glow, {
    albedoColor: Color4.create(1, 0.6, 0.2, 0.06),
    emissiveColor: Color3.fromHexString('#ff8a3d'),
    emissiveIntensity: 1.2,
    roughness: 1
  })

  flameOuter = cone(Color4.fromHexString('#ff5a1eff'), Color3.fromHexString('#ff5a1e'), 0.55)
  flameMid = cone(Color4.fromHexString('#ff9e2cff'), Color3.fromHexString('#ff9e2c'), 0.8)
  flameCore = cone(Color4.fromHexString('#ffe66bff'), Color3.fromHexString('#ffe66b'), 1)

  for (let i = 0; i < 12; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(FIRE_POS.x, 0.5, FIRE_POS.z), scale: Vector3.create(0.07, 0.07, 0.07) })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(1, 0.7, 0.3, 1),
      emissiveColor: Color3.fromHexString('#ffb347'),
      emissiveIntensity: 2
    })
    VisibilityComponent.create(e, { visible: false })
    embers.push({ e, vy: 0, life: 0, ttl: 0, shown: false })
  }

  statusLabel = engine.addEntity()
  Transform.create(statusLabel, { position: Vector3.create(FIRE_POS.x, 3.1, FIRE_POS.z) })
  Billboard.create(statusLabel)
  TextShape.create(statusLabel, {
    text: '🔥 100%',
    fontSize: 3,
    textColor: Color4.create(1, 0.85, 0.4, 1),
    outlineColor: Color4.Black(),
    outlineWidth: 0.2
  })
}

function buildSeats(): void {
  for (let i = 0; i < SEAT_COUNT; i++) {
    const a = (i / SEAT_COUNT) * Math.PI * 2
    const px = FIRE_POS.x + Math.cos(a) * SEAT_RADIUS
    const pz = FIRE_POS.z + Math.sin(a) * SEAT_RADIUS
    seatPositions.push(Vector3.create(px, 0, pz))
    const seat = engine.addEntity()
    Transform.create(seat, {
      position: Vector3.create(px, 0.25, pz),
      scale: Vector3.create(1.1, 0.32, 0.42),
      rotation: Quaternion.fromEulerDegrees(0, (a * 180) / Math.PI + 90, 0)
    })
    MeshRenderer.setBox(seat)
    MeshCollider.setBox(seat)
    Material.setPbrMaterial(seat, { albedoColor: LOG_DARK, roughness: 1 })
  }
}

function playerPos(): Vector3 | undefined {
  return Transform.getOrNull(engine.PlayerEntity)?.position
}

// --- Actions ---------------------------------------------------------
export function addWoodAction(): void {
  if (local.carrying <= 0) {
    setToast('Gather wood from a pile first')
    return
  }
  if (!local.nearFire) {
    setToast('Walk up to the fire to add wood')
    return
  }
  const logs = local.carrying
  local.carrying = 0
  feedFire(logs)
}

export function sitByFire(): void {
  const p = playerPos()
  let best = seatPositions[0]
  if (p) {
    let bestD = Infinity
    for (const s of seatPositions) {
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
  }
  void movePlayerTo({
    newRelativePosition: Vector3.create(best.x, 0.4, best.z),
    cameraTarget: Vector3.create(FIRE_POS.x, 1.2, FIRE_POS.z)
  })
  setToast('Pull up a log 🔥')
}

// --- Systems -------------------------------------------------------
function proximitySystem(): void {
  const p = playerPos()
  if (!p) return
  const d = Math.sqrt((p.x - FIRE_POS.x) ** 2 + (p.z - FIRE_POS.z) ** 2)
  local.distToFire = d
  local.nearFire = d <= FIRE_RANGE
}

function flameSystem(dt: number): void {
  const s = CampfireState.getOrNull(stateEntity)
  if (!s) return
  const time = Date.now() / 1000
  const fuelF = Math.max(0, Math.min(1, s.fuel / MAX_FUEL))
  const lvlF = (s.level - 1) / (MAX_LEVEL - 1)
  const bump = local.flameBump
  const out = s.fuel <= 0.5

  const flicker = 1 + Math.sin(time * 18) * 0.06 + Math.sin(time * 7.3) * 0.045
  const height = out ? 0 : 0.55 + fuelF * 1.15 + lvlF * 0.7 + bump * 0.5
  const width = out ? 0 : 0.75 + lvlF * 0.25 + bump * 0.15

  const outChanged = out !== lastOut

  const layers: { e: Entity; h: number; w: number }[] = [
    { e: flameOuter, h: 1.0, w: 1.15 },
    { e: flameMid, h: 0.72, w: 0.82 },
    { e: flameCore, h: 0.44, w: 0.5 }
  ]
  for (const ly of layers) {
    if (outChanged) VisibilityComponent.createOrReplace(ly.e, { visible: !out })
    const tr = Transform.getMutable(ly.e)
    tr.scale.y = height * ly.h * flicker
    tr.scale.x = width * ly.w * (2 - flicker)
    tr.scale.z = width * ly.w * (2 - flicker)
    tr.position.y = 0.35 + height * ly.h * 0.5
  }

  if (!out) {
    // colour shift: warm yellow when strong, deep red when dying
    const warm = Color3.create(1, 0.6 + fuelF * 0.3, 0.2 + fuelF * 0.35)
    Material.setPbrMaterial(flameMid, {
      albedoColor: Color4.create(warm.r, warm.g, warm.b, 0.8),
      emissiveColor: warm,
      emissiveIntensity: 2.4
    })
  }

  const gt = Transform.getMutable(glow)
  const gs = out ? 0.4 : 2 + fuelF * 2.4 + lvlF * 1.6 + bump * 1.2
  gt.scale.x = gt.scale.y = gt.scale.z = gs
  Material.setPbrMaterial(glow, {
    albedoColor: Color4.create(1, 0.6, 0.2, 0.06),
    emissiveColor: Color3.fromHexString('#ff8a3d'),
    emissiveIntensity: out ? 0.15 : 0.5 + fuelF * 1.7 + bump * 1.2
  })

  // logs char when the fire is dead (only rewrite on state change)
  if (outChanged) {
    for (const e of logEntities) {
      Material.setPbrMaterial(e, { albedoColor: out ? CHARRED : LOG_DARK, roughness: 1 })
    }
  }
  lastOut = out

  // embers
  const activeCount = out ? 0 : Math.min(embers.length, 3 + s.level)
  for (let i = 0; i < embers.length; i++) {
    const em = embers[i]
    if (i >= activeCount) {
      if (em.shown) {
        em.shown = false
        VisibilityComponent.createOrReplace(em.e, { visible: false })
      }
      continue
    }
    em.life += dt
    if (em.life >= em.ttl) {
      em.life = 0
      em.ttl = 1.1 + Math.random() * 1.4
      em.vy = 0.9 + Math.random() * 0.8
      const tr = Transform.getMutable(em.e)
      tr.position.x = FIRE_POS.x + (Math.random() - 0.5) * 0.5
      tr.position.z = FIRE_POS.z + (Math.random() - 0.5) * 0.5
      tr.position.y = 0.5
      if (!em.shown) {
        em.shown = true
        VisibilityComponent.createOrReplace(em.e, { visible: true })
      }
    }
    const tr = Transform.getMutable(em.e)
    tr.position.y += em.vy * dt
    tr.position.x += Math.sin((time + i) * 3) * dt * 0.25
    const k = 1 - em.life / em.ttl
    tr.scale.x = tr.scale.y = tr.scale.z = 0.09 * k
  }

  // floating status (only rewrite when the displayed values change)
  const pct = Math.ceil(Math.max(0, s.fuel))
  const critical = s.fuel < 15
  const statusKey = `${critical ? 'low' : ''}${pct}|${s.level}`
  if (statusKey !== lastStatusKey) {
    lastStatusKey = statusKey
    const label = TextShape.getMutable(statusLabel)
    label.text = critical
      ? `🥶 ${pct}% — feed me!\nLevel ${s.level}`
      : `🔥 ${pct}%\nLevel ${s.level}`
    label.textColor =
      s.fuel < 25 ? Color4.create(1, 0.4, 0.3, 1) : Color4.create(1, 0.85, 0.4, 1)
  }
}

function buildWarmthAndBurst(): void {
  // Warmth ring: a soft glowing disc on the ground that grows with the fire.
  warmthRing = engine.addEntity()
  Transform.create(warmthRing, {
    position: Vector3.create(FIRE_POS.x, 0.04, FIRE_POS.z),
    scale: Vector3.create(6, 0.02, 6)
  })
  MeshRenderer.setCylinder(warmthRing)
  Material.setPbrMaterial(warmthRing, {
    albedoColor: Color4.create(1, 0.65, 0.3, 0.12),
    emissiveColor: Color3.fromHexString('#ff9a45'),
    emissiveIntensity: 0.6
  })

  // Celebration sparks for level-ups.
  for (let i = 0; i < 20; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(FIRE_POS.x, -20, FIRE_POS.z), scale: Vector3.create(0.12, 0.12, 0.12) })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(1, 0.85, 0.4, 1),
      emissiveColor: Color3.fromHexString('#ffd27a'),
      emissiveIntensity: 3
    })
    VisibilityComponent.create(e, { visible: false })
    bursts.push({ e, vx: 0, vy: 0, vz: 0, life: 0 })
  }
}

function warmthSystem(dt: number): void {
  const s = CampfireState.getOrNull(stateEntity)
  if (!s) return
  const fuelF = Math.max(0, Math.min(1, s.fuel / MAX_FUEL))
  const lvlF = (s.level - 1) / (MAX_LEVEL - 1)
  const radius = 2.4 + lvlF * 3.2 + fuelF * 1.4
  const tr = Transform.getMutable(warmthRing)
  tr.scale.x = tr.scale.z = radius * 2
  const pulse = 0.5 + 0.15 * Math.sin(now() * 2)
  Material.setPbrMaterial(warmthRing, {
    albedoColor: Color4.create(1, 0.65, 0.3, 0.1 + fuelF * 0.06),
    emissiveColor: Color3.fromHexString('#ff9a45'),
    emissiveIntensity: (0.4 + fuelF * 0.8) * pulse
  })
  local.cozy = local.distToFire <= radius

  // Fire off the celebration burst once per level-up.
  if (local.celebrateUntil > now() && celebrated < local.celebrateUntil) {
    celebrated = local.celebrateUntil
    for (const b of bursts) {
      b.life = 1.2
      const a = Math.random() * Math.PI * 2
      const sp = 3 + Math.random() * 3
      b.vx = Math.cos(a) * sp
      b.vz = Math.sin(a) * sp
      b.vy = 3.5 + Math.random() * 2.5
      const t = Transform.getMutable(b.e)
      t.position.x = FIRE_POS.x
      t.position.y = 0.8
      t.position.z = FIRE_POS.z
      t.scale.x = t.scale.y = t.scale.z = 0.14
      VisibilityComponent.createOrReplace(b.e, { visible: true })
    }
  }
  for (const b of bursts) {
    if (b.life <= 0) continue
    b.life -= dt
    const t = Transform.getMutable(b.e)
    t.position.x += b.vx * dt
    t.position.y += b.vy * dt
    t.position.z += b.vz * dt
    b.vy -= 7 * dt
    t.scale.x = t.scale.y = t.scale.z = Math.max(0, 0.14 * (b.life / 1.2))
    if (b.life <= 0) VisibilityComponent.createOrReplace(b.e, { visible: false })
  }
}

export function setupCampfire(): void {
  buildFirePit()
  buildFlame()
  buildSeats()
  buildWarmthAndBurst()
  engine.addSystem(proximitySystem)
  engine.addSystem(flameSystem)
  engine.addSystem(warmthSystem)
}
