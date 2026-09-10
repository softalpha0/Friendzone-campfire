import { engine } from '@dcl/sdk/ecs'
import { syncEntity, myProfile } from '@dcl/sdk/network'
import { MessageBus } from '@dcl/sdk/message-bus'
import { getPlayer, onEnterScene } from '@dcl/sdk/players'
import {
  DECAY_PER_SEC,
  FUEL_PER_LOG,
  MAX_FUEL,
  MIN_FUEL,
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
  recordGathered,
  setToast
} from './state'
import { loadPersisted, savePersisted } from './persistence'

/** Scene-wide message bus for ephemeral social events (toasts, FX, invites). */
export const sceneBus = new MessageBus()

/** The single entity holding the replicated campfire state. */
export const stateEntity = engine.addEntity()
CampfireState.create(stateEntity, defaultCampfireState)
// Networking is best-effort: if the sync transport isn't ready the scene still
// runs single-player rather than failing to load.
try {
  syncEntity(stateEntity, [CampfireState.componentId], SYNC_STATE_ENUM_ID)
} catch (e) {
  console.error('[campfire] syncEntity failed; running unsynced', e)
}

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
  const wasOut = s.fuel <= MIN_FUEL + 1
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
type RosterMsg = { id: string; name: string; logs: number; gathered: number }
type WoodMsg = { id: string; name: string; total: number }
type NameMsg = { name: string }

function selfRoster(): RosterMsg {
  const me = identity()
  return { id: me.id, name: me.name, logs: local.contributed, gathered: local.gathered }
}

sceneBus.on('feed', (m: FeedMsg) => {
  if (m.id === identity().id) return
  recordContribution(m.id, m.name, m.total)
  local.flameBump = Math.max(local.flameBump, 0.8)
  setToast(`${m.name} fed the fire +${m.logs} 🪵`)
})

sceneBus.on('wood', (m: WoodMsg) => {
  if (m.id === identity().id) return
  recordGathered(m.id, m.name, m.total)
})

sceneBus.on('roster', (m: RosterMsg) => {
  if (m.id === identity().id) return
  recordContribution(m.id, m.name, m.logs)
  recordGathered(m.id, m.name, m.gathered)
})

sceneBus.on('hello', () => {
  sceneBus.emit('roster', selfRoster())
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
let loadTimer = 0
let didLoad = false
let sinceSave = 0

function coreSystem(dt: number): void {
  advanceClock(dt)

  const s = CampfireState.getOrNull(stateEntity)
  if (!s) return

  // Pull persisted camp history a moment after load (best-effort).
  if (!didLoad) {
    loadTimer += dt
    if (loadTimer > 2) {
      didLoad = true
      void loadPersisted()
    }
  }

  // Keep our clock in step with the furthest-ahead client.
  reconcileClock(s.lastTickAt)
  const t = now()

  // Rate-limited decay: whichever client crosses the 1s mark first applies it.
  // Fuel never drops below MIN_FUEL — the fire always keeps a small ember.
  if (t - s.lastTickAt >= 1.0) {
    const m = CampfireState.getMutable(stateEntity)
    const step = Math.min(t - m.lastTickAt, 5)
    if (m.fuel > MIN_FUEL) m.fuel = Math.max(MIN_FUEL, m.fuel - DECAY_PER_SEC * step)
    m.lastTickAt = t
  }

  // Shared level-up moment for everyone in the World.
  if (s.level > lastSeenLevel) {
    lastSeenLevel = s.level
    local.flameBump = 1
    local.celebrateUntil = now() + 1.4
    local.levelBanner = { level: s.level, until: now() + 2.6 }
    setToast(`🔥 The campfire reached Level ${s.level}!`, 4.5)
    void savePersisted()
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
    if (local.contributed > 0 || local.gathered > 0) sceneBus.emit('roster', selfRoster())
  }

  // Periodically persist camp progress so it survives an empty World.
  sinceSave += dt
  if (sinceSave > 30) {
    sinceSave = 0
    if (didLoad && s.totalLogs > 0) void savePersisted()
  }
}

export function setupSync(): void {
  engine.addSystem(coreSystem)
  // Seed the local leaderboard with an empty self entry so the HUD has a row.
  roster.clear()

  // Greet arrivals so the camp feels populated.
  try {
    onEnterScene((player) => {
      if (!player || player.userId === identity().id) return
      setToast(`${player.name || 'Someone'} joined the campfire 🔥`, 3.5)
    })
  } catch (e) {
    console.error('[campfire] onEnterScene hook failed', e)
  }
}
