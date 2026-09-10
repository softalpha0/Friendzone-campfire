import {
  engine,
  Transform,
  TextShape,
  Billboard,
  VisibilityComponent,
  PlayerIdentityData,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { FIRE_POS } from './config'
import { sceneBus, identity } from './sync'

/** Quick tap-to-react emojis — no typing needed, great on touch. */
export const REACTIONS = ['👍', '🔥', '❤️', '😂', '🙌']

type Floater = { e: Entity; vy: number; life: number; ttl: number; active: boolean }
const pool: Floater[] = []

function spawnAt(pos: Vector3, emoji: string): void {
  const f = pool.find((p) => !p.active)
  if (!f) return
  f.active = true
  f.life = 0
  f.ttl = 2.2
  f.vy = 1.4
  const t = Transform.getMutable(f.e)
  t.position.x = pos.x + (Math.random() - 0.5) * 0.4
  t.position.y = pos.y + 2.1
  t.position.z = pos.z + (Math.random() - 0.5) * 0.4
  t.scale.x = t.scale.y = t.scale.z = 1.4
  TextShape.getMutable(f.e).text = emoji
  VisibilityComponent.createOrReplace(f.e, { visible: true })
}

/** World position of any player (local or remote) by address, if known. */
export function playerWorldPos(addr: string): Vector3 | null {
  if (addr && addr.toLowerCase() === identity().id.toLowerCase()) {
    return Transform.getOrNull(engine.PlayerEntity)?.position ?? null
  }
  const target = (addr ?? '').toLowerCase()
  for (const [e, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if ((id.address ?? '').toLowerCase() === target) {
      const t = Transform.getOrNull(e)
      if (t) return t.position
    }
  }
  return null
}

export function sendReaction(emoji: string): void {
  spawnAt(playerWorldPos(identity().id) ?? FIRE_POS, emoji)
  sceneBus.emit('react', { id: identity().id, emoji })
}

function floatSystem(dt: number): void {
  for (const f of pool) {
    if (!f.active) continue
    f.life += dt
    const t = Transform.getMutable(f.e)
    t.position.y += f.vy * dt
    f.vy *= 1 - dt * 0.6
    const k = Math.max(0, 1 - f.life / f.ttl)
    t.scale.x = t.scale.y = t.scale.z = 1.6 * k
    if (f.life >= f.ttl) {
      f.active = false
      VisibilityComponent.createOrReplace(f.e, { visible: false })
    }
  }
}

export function setupReactions(): void {
  for (let i = 0; i < 12; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -20, 0), scale: Vector3.create(1, 1, 1) })
    TextShape.create(e, {
      text: '🔥',
      fontSize: 4,
      textColor: Color4.White(),
      outlineColor: Color4.Black(),
      outlineWidth: 0.2
    })
    Billboard.create(e)
    VisibilityComponent.create(e, { visible: false })
    pool.push({ e, vy: 0, life: 0, ttl: 0, active: false })
  }

  sceneBus.on('react', (m: { id: string; emoji: string }) => {
    if (m.id === identity().id) return
    spawnAt(playerWorldPos(m.id) ?? FIRE_POS, m.emoji)
  })

  engine.addSystem(floatSystem)
}
