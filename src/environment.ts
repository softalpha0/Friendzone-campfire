import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { FIRE_POS, PARCEL_SIZE, WORLD_URL, nextLevelAt } from './config'
import { CampfireState, leaderBy } from './state'
import { stateEntity } from './sync'

const GRASS = Color4.fromHexString('#33471fff')
const DIRT = Color4.fromHexString('#3a2a1cff')
const BARK = Color4.fromHexString('#4a3524ff')
const LEAF = Color4.fromHexString('#26391cff')
const ROCK = Color4.fromHexString('#4b4b4fff')
const PLANK = Color4.fromHexString('#6b4a2fff')
const METAL = Color4.fromHexString('#242424ff')
const GLOW = Color3.fromHexString('#ffcf7a')

function box(pos: Vector3, scale: Vector3, color: Color4, rotY = 0): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale, rotation: Quaternion.fromEulerDegrees(0, rotY, 0) })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: color, roughness: 1 })
  return e
}

function sphere(pos: Vector3, scale: Vector3, color: Color4): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: pos, scale })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, { albedoColor: color, roughness: 1 })
  return e
}

function tree(x: number, z: number, h: number): void {
  const trunk = engine.addEntity()
  Transform.create(trunk, { position: Vector3.create(x, h / 2, z), scale: Vector3.create(0.45, h, 0.45) })
  MeshRenderer.setCylinder(trunk)
  MeshCollider.setCylinder(trunk)
  Material.setPbrMaterial(trunk, { albedoColor: BARK, roughness: 1 })
  sphere(Vector3.create(x, h + 0.2, z), Vector3.create(2.6, 2.2, 2.6), LEAF)
  sphere(Vector3.create(x + 0.5, h + 1.1, z - 0.3), Vector3.create(1.8, 1.6, 1.8), LEAF)
}

function sign(pos: Vector3, rotY: number, text: string, fontSize = 1): Entity {
  const rad = (rotY * Math.PI) / 180
  const nx = Math.sin(rad)
  const nz = Math.cos(rad)

  const post = engine.addEntity()
  Transform.create(post, { position: Vector3.create(pos.x, 0.75, pos.z), scale: Vector3.create(0.12, 1.5, 0.12) })
  MeshRenderer.setBox(post)
  Material.setPbrMaterial(post, { albedoColor: PLANK, roughness: 1 })

  const board = engine.addEntity()
  Transform.create(board, {
    position: Vector3.create(pos.x, 1.6, pos.z),
    scale: Vector3.create(2.2, 1.1, 0.08),
    rotation: Quaternion.fromEulerDegrees(0, rotY, 0)
  })
  MeshRenderer.setBox(board)
  Material.setPbrMaterial(board, {
    albedoColor: Color4.fromHexString('#8a6440ff'),
    emissiveColor: Color3.fromHexString('#3a2a1c'),
    emissiveIntensity: 0.25,
    roughness: 1
  })

  // Text sits just in front of the board face so it can't z-fight.
  const label = engine.addEntity()
  Transform.create(label, {
    position: Vector3.create(pos.x + nx * 0.06, 1.6, pos.z + nz * 0.06),
    rotation: Quaternion.fromEulerDegrees(0, rotY, 0)
  })
  TextShape.create(label, {
    text,
    fontSize,
    textColor: Color4.create(1, 0.96, 0.88, 1),
    outlineColor: Color4.Black(),
    outlineWidth: 0.12
  })
  return label
}

// --- Level-reactive lanterns -----------------------------------------
type Lantern = { glass: Entity; onAtLevel: number; lit: number }
const lanterns: Lantern[] = []

function lantern(x: number, z: number, onAtLevel: number): void {
  const pole = engine.addEntity()
  Transform.create(pole, { position: Vector3.create(x, 1.1, z), scale: Vector3.create(0.1, 2.2, 0.1) })
  MeshRenderer.setCylinder(pole)
  Material.setPbrMaterial(pole, { albedoColor: METAL, roughness: 1 })

  const glass = engine.addEntity()
  Transform.create(glass, { position: Vector3.create(x, 2.2, z), scale: Vector3.create(0.32, 0.42, 0.32) })
  MeshRenderer.setSphere(glass)
  Material.setPbrMaterial(glass, {
    albedoColor: Color4.create(1, 0.8, 0.45, 1),
    emissiveColor: GLOW,
    emissiveIntensity: 0
  })
  lanterns.push({ glass, onAtLevel, lit: 0 })
}

function lanternSystem(dt: number): void {
  const level = CampfireState.getOrNull(stateEntity)?.level ?? 1
  for (const l of lanterns) {
    const target = level >= l.onAtLevel ? 1 : 0
    if (Math.abs(target - l.lit) < 0.005) continue
    l.lit += (target - l.lit) * Math.min(1, dt * 2.5)
    Material.setPbrMaterial(l.glass, {
      albedoColor: Color4.create(1, 0.8, 0.45, 1),
      emissiveColor: GLOW,
      emissiveIntensity: 0.15 + l.lit * 2.2
    })
  }
}

// --- Fireflies -----------------------------------------------------
type Firefly = { e: Entity; base: Vector3; phase: number; radius: number }
const fireflies: Firefly[] = []

function fireflySystem(dt: number): void {
  for (const f of fireflies) {
    f.phase += dt * (0.4 + f.radius * 0.15)
    const t = Transform.getMutable(f.e)
    t.position.x = f.base.x + Math.cos(f.phase) * f.radius
    t.position.z = f.base.z + Math.sin(f.phase * 0.8) * f.radius
    t.position.y = f.base.y + Math.sin(f.phase * 1.7) * 0.35
  }
}

// --- Camp board (updates with shared state) --------------------------
let boardLabel: Entity
let boardKey = ''

function boardSystem(): void {
  const s = CampfireState.getOrNull(stateEntity)
  if (!s || !boardLabel) return
  const fk = leaderBy('logs')
  const wc = leaderBy('gathered')
  const key = `${s.level}|${s.totalLogs}|${s.savedCount}|${fk?.name ?? ''}|${wc?.name ?? ''}`
  if (key === boardKey) return
  boardKey = key
  const next = nextLevelAt(s.level)
  const nextLine = next === null ? 'MAX LEVEL' : `next at ${next}`
  const trim = (n?: string) => (n ? n.slice(0, 12) : '-')
  TextShape.getMutable(boardLabel).text =
    `CAMP LOG\n` +
    `Level ${s.level}  ·  ${s.totalLogs} logs  ·  ${nextLine}\n` +
    `rescued ${s.savedCount}x  ·  Firekeeper ${trim(fk?.name)}`
}

export function setupEnvironment(): void {
  // Ground
  const ground = engine.addEntity()
  Transform.create(ground, {
    position: Vector3.create(PARCEL_SIZE / 2, -0.05, PARCEL_SIZE / 2),
    scale: Vector3.create(PARCEL_SIZE, 0.1, PARCEL_SIZE)
  })
  MeshRenderer.setBox(ground)
  MeshCollider.setBox(ground)
  Material.setPbrMaterial(ground, { albedoColor: GRASS, roughness: 1 })

  // Dirt clearing under the fire
  const dirt = engine.addEntity()
  Transform.create(dirt, {
    position: Vector3.create(FIRE_POS.x, 0.02, FIRE_POS.z),
    scale: Vector3.create(7, 0.06, 7)
  })
  MeshRenderer.setCylinder(dirt)
  Material.setPbrMaterial(dirt, { albedoColor: DIRT, roughness: 1 })

  // Trees around the edges
  tree(2.2, 8.5, 3.2)
  tree(8.4, 14.0, 3.6)
  tree(14.0, 9.2, 3.0)
  tree(11.5, 2.0, 3.4)
  tree(4.6, 12.6, 2.8)

  // Rocks
  sphere(Vector3.create(5.4, 0.25, 10.6), Vector3.create(1.1, 0.7, 1.1), ROCK)
  sphere(Vector3.create(10.8, 0.2, 6.0), Vector3.create(0.9, 0.55, 0.9), ROCK)
  sphere(Vector3.create(6.2, 0.2, 5.2), Vector3.create(0.8, 0.5, 1.0), ROCK)
  sphere(Vector3.create(10.2, 0.22, 11.4), Vector3.create(1.0, 0.6, 0.9), ROCK)

  // Low fence posts around the perimeter for a cozy enclosure
  for (const p of [2, 6, 10, 14]) {
    box(Vector3.create(p, 0.5, 0.5), Vector3.create(0.14, 1, 0.14), PLANK)
    box(Vector3.create(p, 0.5, 15.5), Vector3.create(0.14, 1, 0.14), PLANK)
    box(Vector3.create(0.5, 0.5, p), Vector3.create(0.14, 1, 0.14), PLANK)
    box(Vector3.create(15.5, 0.5, p), Vector3.create(0.14, 1, 0.14), PLANK)
  }

  // Lanterns — light up as the camp levels up
  lantern(4.5, 8.0, 1)
  lantern(8.0, 4.6, 2)
  lantern(11.5, 8.0, 3)
  lantern(8.0, 11.4, 4)
  lantern(5.6, 5.6, 5)
  lantern(10.4, 10.4, 6)

  // Fireflies near the fire
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    const base = Vector3.create(
      FIRE_POS.x + Math.cos(angle) * 2.4,
      1.1 + (i % 2) * 0.4,
      FIRE_POS.z + Math.sin(angle) * 2.4
    )
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(base.x, base.y, base.z), scale: Vector3.create(0.08, 0.08, 0.08) })
    MeshRenderer.setSphere(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(1, 0.95, 0.6, 1),
      emissiveColor: Color3.fromHexString('#fff2b0'),
      emissiveIntensity: 1.6
    })
    fireflies.push({ e, base, phase: angle, radius: 0.5 + (i % 3) * 0.25 })
  }

  // Signs — kept short so the text fits the board; the HUD teaches the rest.
  sign(
    Vector3.create(5.5, 0, 4.2),
    35,
    'FRIENDZONE CAMPFIRE\n\nGATHER wood  ·  FEED the fire\nLevel up the camp together',
    0.9
  )
  boardLabel = sign(Vector3.create(11.0, 0, 11.4), -135, 'CAMP LOG', 0.8)
  sign(
    Vector3.create(11.4, 0, 5.0),
    -45,
    'BRING A FRIEND\n\n' + WORLD_URL,
    0.9
  )

  engine.addSystem(lanternSystem)
  engine.addSystem(fireflySystem)
  engine.addSystem(boardSystem)
}
