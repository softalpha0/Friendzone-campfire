import { engine } from '@dcl/sdk/ecs'
import { syncEntity, myProfile } from '@dcl/sdk/network'
import { MessageBus } from '@dcl/sdk/message-bus'
import { getPlayer } from '@dcl/sdk/players'
import {
  DECAY_PER_SEC,
  FUEL_PER_LOG,
  MAX_FUEL,
  SYNC_STATE_ENUM_ID,
  levelForContribution
} from './config'
import {
  CampfireState,
  defaultCampfireState,
  advanceClock,
  reconcileClock,
  now,
  local,
  roster,
  recordContribution,
  setToast
} from './state'

/** Scene-wide message bus for ephemeral social events (toasts, FX, invites). */
export const sceneBus = new MessageBus()

/** The single entity holding the replicated campfire state. */
export const stateEntity = engine.addEntity()
CampfireState.create(stateEntity, defaultCampfireState)
syncEntity(stateEntity, [CampfireState.componentId], SYNC_STATE_ENUM_ID)

// --- Identity -----------------------------------------------------------
let cachedName = ''
export function identity(): { id: string; name: string } {
  if (!cachedName) {
    const p = getPlayer()
    if (p?.name) cachedName = p.name
  }
  return { id: myProfile.userId ?? 'me', name: cachedName || 'Camper' }
}

// --- Public actions ---------------------------------------------------
/** Drop `logs` logs into the fire. Updates replicated state + broadcasts. */
export function feedFire(logs: number): void {
  if (logs <= 0) return
  const s = CampfireState.get(stateEntity)
  const wasOut = s.fuel <= 0
  const m = CampfireState.getMutable(stateEntity)
  m.fuel = Math.min(MAX_FUEL, m.fuel + logs * FUEL_PER_LOG)
  m.totalLogs += logs
  m.level = levelForContribution(m.totalLogs)
  if (wasOut) m.savedCount += 1

  local.contributed += logs
  local.flameBump = 1
  const me = identity()
  recordContribution(me.id, me.name, local.contributed)
  sceneBus.emit('feed', { id: me.id, name: me.name, logs, total: local.contributed })
  setToast(wasOut ? `You brought the fire back to life! +${logs}` : `You fed the fire +${logs}`)
}

// --- Networked social events -----------------------------------------
type FeedMsg = { id: string; name: string; logs: number; total: number }
type RosterMsg = { id: string; name: string; total: number }
type NameMsg = { name: string }

sceneBus.on('feed', (m: FeedMsg) => {
  if (m.id === identity().id) return
  recordContribution(m.id, m.name, m.total)
  local.flameBump = Math.max(local.flameBump, 0.8)
  setToast(`${m.name} fed the fire +${m.logs} 🪵`)
})

sceneBus.on('roster', (m: RosterMsg) => {
  if (m.id === identity().id) return
  recordContribution(m.id, m.name, m.total)
})

sceneBus.on('hello', () => {
  const me = identity()
  sceneBus.emit('roster', { id: me.id, name: me.name, total: local.contributed })
})

sceneBus.on('invite', (m: NameMsg) => {
  if (m.name === identity().name) return
  setToast(`${m.name} is calling everyone to the fire 🔥`, 4)
})

sceneBus.on('cheers', (m: NameMsg) => {
  if (m.name === identity().name) return
  setToast(`${m.name}: cheers! 🥂`, 3)
})

sceneBus.on('roast', (m: NameMsg) => {
  if (m.name === identity().name) return
  setToast(`${m.name} roasted the perfect marshmallow 🍡`, 3)
})

// --- Systems --------------------------------------------------------
let sinceHeartbeat = 0
let saidHello = false
let helloTimer = 0
let lastSeenLevel = 1

function coreSystem(dt: number): void {
  advanceClock(dt)

  const s = CampfireState.getOrNull(stateEntity)
  if (!s) return

  // Keep our clock in step with the furthest-ahead client.
  reconcileClock(s.lastTickAt)
  const t = now()

  // Rate-limited decay: whichever client crosses the 1s mark first applies it.
  if (t - s.lastTickAt >= 1.0) {
    const m = CampfireState.getMutable(stateEntity)
    const step = Math.min(t - m.lastTickAt, 5)
    if (m.fuel > 0) m.fuel = Math.max(0, m.fuel - DECAY_PER_SEC * step)
    m.lastTickAt = t
  }

  // Shared level-up moment for everyone in the World.
  if (s.level > lastSeenLevel) {
    lastSeenLevel = s.level
    local.flameBump = 1
    setToast(`🔥 The campfire reached Level ${s.level}!`, 4.5)
  } else if (s.level < lastSeenLevel) {
    lastSeenLevel = s.level
  }

  // Ease the "whoosh" that plays when anyone feeds the fire.
  if (local.flameBump > 0) local.flameBump = Math.max(0, local.flameBump - dt * 0.8)

  // Say hello shortly after load so we pull everyone's leaderboard totals.
  if (!saidHello) {
    helloTimer += dt
    if (helloTimer > 1.5) {
      saidHello = true
      sceneBus.emit('hello', {})
    }
  }

  // Periodic roster refresh so late joiners and reconnects stay in sync.
  sinceHeartbeat += dt
  if (sinceHeartbeat > 3) {
    sinceHeartbeat = 0
    if (local.contributed > 0) {
      const me = identity()
      sceneBus.emit('roster', { id: me.id, name: me.name, total: local.contributed })
    }
  }
}

export function setupSync(): void {
  engine.addSystem(coreSystem)
  // Seed the local leaderboard with an empty self entry so the HUD has a row.
  roster.clear()
}
