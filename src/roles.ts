import { engine, Transform, TextShape, Billboard, VisibilityComponent, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { leaderBy } from './state'
import { playerWorldPos } from './reactions'
import { identity } from './sync'

/**
 * Emergent roles: whoever has fed the fire most is the Firekeeper, whoever has
 * chopped the most wood is the Woodcutter. A floating title tracks that player's
 * avatar, so the group visibly holds responsibilities (see Nico's social-gaming
 * notes). Recomputed from the shared roster twice a second.
 */
let firekeeper: Entity
let woodcutter: Entity

function makeTitle(text: string, color: Color4): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(0, -30, 0) })
  TextShape.create(e, {
    text,
    fontSize: 1.3,
    textColor: color,
    outlineColor: Color4.Black(),
    outlineWidth: 0.2
  })
  Billboard.create(e)
  VisibilityComponent.create(e, { visible: false })
  return e
}

function place(e: Entity, addr: string | null, yOffset: number): void {
  // Skip your own title — the HUD already tells you, and a label in your own
  // first-person camera is just clutter. Others still see it above you.
  const pos = addr && addr.toLowerCase() !== identity().id.toLowerCase() ? playerWorldPos(addr) : null
  if (!pos) {
    VisibilityComponent.createOrReplace(e, { visible: false })
    return
  }
  const t = Transform.getMutable(e)
  t.position.x = pos.x
  t.position.z = pos.z
  t.position.y = pos.y + yOffset
  VisibilityComponent.createOrReplace(e, { visible: true })
}

let acc = 0
function rolesSystem(dt: number): void {
  acc += dt
  if (acc < 0.5) return
  acc = 0
  const fk = leaderBy('logs')?.id ?? null
  const wc = leaderBy('gathered')?.id ?? null
  place(firekeeper, fk, 2.9)
  place(woodcutter, wc, fk && wc === fk ? 3.5 : 2.9)
}

export function setupRoles(): void {
  firekeeper = makeTitle('🔥 Firekeeper', Color4.create(1, 0.72, 0.32, 1))
  woodcutter = makeTitle('🪓 Woodcutter', Color4.create(0.82, 0.92, 1, 1))
  engine.addSystem(rolesSystem)
}
