import { engine, Schemas } from '@dcl/sdk/ecs'
import { START_FUEL } from './config'

/**
 * Shared, network-synced campfire state. One instance lives on `stateEntity`
 * (see sync.ts) and is replicated to every player in the World.
 */
export const CampfireState = engine.defineComponent('campfire::state', {
  fuel: Schemas.Float,
  totalLogs: Schemas.Int,
  level: Schemas.Int,
  savedCount: Schemas.Int,
  // Scene-clock timestamp of the last decay tick. Used to rate-limit decay
  // across clients without electing a single authority.
  lastTickAt: Schemas.Float
})

export const defaultCampfireState = {
  fuel: START_FUEL,
  totalLogs: 0,
  level: 1,
  savedCount: 0,
  lastTickAt: 0
}

// --- Shared scene clock ----------------------------------------------------
// Every client keeps its own frame accumulator, then fast-forwards to match
// the furthest-ahead client it has heard from. This keeps decay timing and
// toast timers consistent for late joiners.
let _raw = 0
let _offset = 0

export function advanceClock(dt: number): void {
  _raw += dt
}

export function reconcileClock(remoteTime: number): void {
  const local = _raw + _offset
  if (remoteTime > local) _offset += remoteTime - local + 0.001
}

export function now(): number {
  return _raw + _offset
}

// --- Local (per-player) runtime state -----------------------------------
export type RoastState = {
  active: boolean
  t: number
  result: '' | 'cold' | 'perfect' | 'burnt'
  resultUntil: number
}

export const local = {
  carrying: 0,
  contributed: 0,
  nearFire: false,
  distToFire: 999,
  nearWood: false,
  woodPileReady: false,
  hasGathered: false,
  showWelcome: true,
  welcomeUntil: 0,
  flameBump: 0,
  cozy: false,
  celebrateUntil: 0,
  levelBanner: { level: 0, until: 0 },
  roast: { active: false, t: 0, result: '', resultUntil: 0 } as RoastState,
  toast: { text: '', until: 0 }
}

export function setToast(text: string, seconds = 3.2): void {
  local.toast.text = text
  local.toast.until = now() + seconds
}

// --- Session leaderboard (ephemeral, rebuilt from network messages) -----
export type RosterEntry = { name: string; logs: number }
export const roster = new Map<string, RosterEntry>()

export function recordContribution(userId: string, name: string, logs: number): void {
  const cur = roster.get(userId)
  if (cur) {
    cur.logs = logs
    cur.name = name || cur.name
  } else {
    roster.set(userId, { name: name || 'Camper', logs })
  }
}

export function topCampers(n: number): RosterEntry[] {
  return [...roster.values()].sort((a, b) => b.logs - a.logs).slice(0, n)
}
