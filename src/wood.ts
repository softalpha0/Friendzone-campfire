import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  ColliderLayer,
  Material,
  VisibilityComponent,
  InputAction,
  pointerEventsSystem,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { triggerEmote } from '~system/RestrictedActions'
import { CARRY_MAX, GATHER_RANGE, LOGS_PER_GATHER, WOOD_PILES, WOOD_RESPAWN } from './config'
import { local, setToast } from './state'
import { sceneBus } from './sync'

const WOOD = Color4.fromHexString('#6b4a2fff')
const WOOD_CUT = Color4.fromHexString('#c69a6dff')

type Pile = { pos: Vector3; logs: Entity[]; ready: boolean; cooldown: number; rendered: boolean }
const piles: Pile[] = []

function buildPile(pos: Vector3): Pile {
  const logs: Entity[] = []
  const rows = [
    { y: 0.12, x: 0, z: 0, rot: 0 },
    { y: 0.12, x: 0, z: 0.32, rot: 0 },
    { y: 0.4, x: 0, z: 0.16, rot: 0 },
    { y: 0.66, x: 0, z: 0.16, rot: 90 }
  ]
  for (const r of rows) {
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.create(pos.x + r.x, r.y, pos.z + r.z),
      scale: Vector3.create(0.16, 0.9, 0.16),
      rotation: Quaternion.fromEulerDegrees(90, r.rot, 0)
    })
    MeshRenderer.setCylinder(e)
    Material.setPbrMaterial(e, { albedoColor: WOOD, roughness: 1 })
    logs.push(e)
  }

  // chopping block
  const block = engine.addEntity()
  Transform.create(block, { position: Vector3.create(pos.x - 0.6, 0.25, pos.z), scale: Vector3.create(0.5, 0.5, 0.5) })
  MeshRenderer.setCylinder(block)
  Material.setPbrMaterial(block, { albedoColor: WOOD_CUT, roughness: 1 })

  // tap target
  const hit = engine.addEntity()
  Transform.create(hit, { position: Vector3.create(pos.x, 0.6, pos.z), scale: Vector3.create(1.4, 1.4, 1.6) })
  MeshCollider.setBox(hit, ColliderLayer.CL_POINTER)

  const pile: Pile = { pos, logs, ready: true, cooldown: 0, rendered: true }
  pileByHit.set(hit, pile)
  pointerEventsSystem.onPointerDown(
    { entity: hit, opts: { button: InputAction.IA_POINTER, hoverText: 'Gather wood', maxDistance: GATHER_RANGE + 1 } },
    () => gatherFrom(pile)
  )
  return pile
}

const pileByHit = new Map<Entity, Pile>()

// --- Chop FX pool --------------------------------------------------
const fx: { e: Entity; vx: number; vy: number; vz: number; life: number }[] = []
function spawnChopFx(pos: Vector3): void {
  let spawned = 0
  for (const p of fx) {
    if (p.life > 0) continue
    p.life = 0.55
    p.vx = (Math.random() - 0.5) * 2.2
    p.vy = 1.5 + Math.random()
    p.vz = (Math.random() - 0.5) * 2.2
    const tr = Transform.getMutable(p.e)
    tr.position.x = pos.x
    tr.position.y = 0.7
    tr.position.z = pos.z
    tr.scale.x = tr.scale.y = tr.scale.z = 0.09
    VisibilityComponent.createOrReplace(p.e, { visible: true })
    if (++spawned >= 5) break
  }
}

function fxSystem(dt: number): void {
  for (const p of fx) {
    if (p.life <= 0) continue
    p.life -= dt
    const tr = Transform.getMutable(p.e)
    tr.position.x += p.vx * dt
    tr.position.y += p.vy * dt
    tr.position.z += p.vz * dt
    p.vy -= 6 * dt
    tr.scale.x = tr.scale.y = tr.scale.z = Math.max(0, 0.09 * (p.life / 0.55))
    if (p.life <= 0) VisibilityComponent.createOrReplace(p.e, { visible: false })
  }
}

// --- Gather -------------------------------------------------------
function nearestReadyPile(): Pile | null {
  const p = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!p) return null
  let best: Pile | null = null
  let bestD = GATHER_RANGE * GATHER_RANGE
  for (const pile of piles) {
    const d = (pile.pos.x - p.x) ** 2 + (pile.pos.z - p.z) ** 2
    if (d <= bestD && pile.ready) {
      bestD = d
      best = pile
    }
  }
  return best
}

function gatherFrom(pile: Pile): void {
  if (!pile.ready) {
    setToast('This pile needs a moment to restock')
    return
  }
  if (local.carrying >= CARRY_MAX) {
    setToast(`Your arms are full (${CARRY_MAX}) — feed the fire!`)
    return
  }
  const got = Math.min(LOGS_PER_GATHER, CARRY_MAX - local.carrying)
  local.carrying += got
  pile.ready = false
  pile.cooldown = WOOD_RESPAWN
  spawnChopFx(pile.pos)
  sceneBus.emit('chop', { x: pile.pos.x, z: pile.pos.z })
  void triggerEmote({ predefinedEmote: 'hammer' })
  setToast(`+${got} logs  (carrying ${local.carrying}/${CARRY_MAX})`)
}

export function gatherAction(): void {
  const pile = nearestReadyPile()
  if (!pile) {
    setToast('Stand next to a wood pile to gather')
    return
  }
  gatherFrom(pile)
}

// --- Systems ----------------------------------------------------
function pileSystem(dt: number): void {
  const p = Transform.getOrNull(engine.PlayerEntity)?.position

  let near: Pile | null = null
  let nearD = GATHER_RANGE * GATHER_RANGE
  for (const pile of piles) {
    if (!pile.ready) {
      pile.cooldown -= dt
      if (pile.cooldown <= 0) pile.ready = true
    }
    // Only rewrite pile visuals when it actually changes state.
    if (pile.ready !== pile.rendered) {
      pile.rendered = pile.ready
      for (let i = 0; i < pile.logs.length; i++) {
        // when depleted only the bottom two logs remain
        VisibilityComponent.createOrReplace(pile.logs[i], { visible: pile.ready || i < 2 })
        Material.setPbrMaterial(pile.logs[i], { albedoColor: pile.ready ? WOOD : WOOD_CUT, roughness: 1 })
      }
    }
    if (p) {
      const d = (pile.pos.x - p.x) ** 2 + (pile.pos.z - p.z) ** 2
      if (d <= nearD) {
        nearD = d
        near = pile
      }
    }
  }
  local.nearWood = !!near
  local.woodPileReady = !!near && near.ready
}

export function setupWood(): void {
  for (const pos of WOOD_PILES) piles.push(buildPile(pos))

  for (let i = 0; i < 12; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -5, 0), scale: Vector3.create(0.09, 0.09, 0.09) })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.fromHexString('#7a5230ff'),
      emissiveColor: Color3.fromHexString('#3a2410'),
      emissiveIntensity: 0.3
    })
    VisibilityComponent.create(e, { visible: false })
    fx.push({ e, vx: 0, vy: 0, vz: 0, life: 0 })
  }

  sceneBus.on('chop', (m: { x: number; z: number }) => spawnChopFx(Vector3.create(m.x, 0, m.z)))
  engine.addSystem(pileSystem)
  engine.addSystem(fxSystem)
}
