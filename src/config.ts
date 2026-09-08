import { Vector3 } from '@dcl/sdk/math'

/**
 * Central tuning + layout for the Campfire hangout.
 * One parcel (16x16). Everything is built from SDK primitives so the scene
 * loads instantly and runs smoothly on phones.
 */

// --- Layout ---------------------------------------------------------------
export const FIRE_POS = Vector3.create(8, 0, 8)
export const PARCEL_SIZE = 16

// Seats around the fire (players tap "Sit by the fire" to snap here).
export const SEAT_RADIUS = 2.9
export const SEAT_COUNT = 6

// Wood piles: where players gather fuel.
export const WOOD_PILES: Vector3[] = [
  Vector3.create(2.4, 0, 13.4),
  Vector3.create(13.6, 0, 13.2),
  Vector3.create(13.4, 0, 2.6),
  Vector3.create(2.6, 0, 3.0)
]

// --- Gameplay tuning ----------------------------------------------------
export const MAX_FUEL = 100
export const START_FUEL = 70
/** The fire never fully dies — it always keeps a small ember to rebuild from,
 *  so a solo visitor never arrives to a cold, dead pit. */
export const MIN_FUEL = 5
/** Fuel burned per second while nobody feeds the fire. */
export const DECAY_PER_SEC = 1.0
/** Fuel restored per log dropped into the fire. */
export const FUEL_PER_LOG = 10
/** Logs gained per gather action. */
export const LOGS_PER_GATHER = 2
/** Max logs a player can carry at once. */
export const CARRY_MAX = 6
/** Seconds a wood pile needs to regrow after being harvested. */
export const WOOD_RESPAWN = 7

/** Reach for context actions (metres). Generous so touch users don't need to aim. */
export const FIRE_RANGE = 5.0
export const GATHER_RANGE = 3.2

// Community campfire levels, keyed on total logs contributed by everyone.
export const LEVEL_THRESHOLDS = [0, 15, 40, 80, 140, 220, 330, 480, 680, 950]
export const MAX_LEVEL = LEVEL_THRESHOLDS.length

export function levelForContribution(totalLogs: number): number {
  let lvl = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalLogs >= LEVEL_THRESHOLDS[i]) lvl = i + 1
  }
  return lvl
}

export function nextLevelAt(level: number): number | null {
  return level >= MAX_LEVEL ? null : LEVEL_THRESHOLDS[level]
}

// --- Marshmallow roasting (local mini-activity) ------------------------
export const ROAST_TOTAL = 6.0
export const ROAST_PERFECT_MIN = 3.0
export const ROAST_PERFECT_MAX = 4.3
export const ROAST_BURNT_AT = 5.2

// --- Networking ids ---------------------------------------------------
export const SYNC_STATE_ENUM_ID = 2001

// --- Sharing --------------------------------------------------------
// Shown on the in-scene "Bring a friend" sign.
export const WORLD_URL = 'softalpha.dcl.eth'
