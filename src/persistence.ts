import { PERSIST_URL, levelForContribution } from './config'
import { CampfireState } from './state'
import { stateEntity } from './sync'

/**
 * Best-effort cross-session persistence via a Firebase Realtime Database REST
 * endpoint (public rules, no auth). Every call is guarded and fire-and-forget:
 * if the endpoint is unset, slow, or down, the scene runs exactly as it does
 * without it. Camp progress only ever moves forward (max of local vs. stored),
 * so a stale write can't roll the community back.
 */
const KEY = 'friendzone-campfire-v1'

type Persisted = {
  totalLogs?: number
  savedCount?: number
  level?: number
  updatedAt?: number
}

function url(): string {
  return `${PERSIST_URL.replace(/\/$/, '')}/${KEY}.json`
}

export async function loadPersisted(): Promise<void> {
  if (!PERSIST_URL) return
  try {
    const res = await fetch(url(), { method: 'GET' })
    if (!res.ok) return
    const data = (await res.json()) as Persisted | null
    if (!data) return
    const m = CampfireState.getMutable(stateEntity)
    if (typeof data.totalLogs === 'number' && data.totalLogs > m.totalLogs) {
      m.totalLogs = data.totalLogs
      m.level = levelForContribution(m.totalLogs)
    }
    if (typeof data.savedCount === 'number' && data.savedCount > m.savedCount) {
      m.savedCount = data.savedCount
    }
  } catch (e) {
    console.error('[campfire] persistence load skipped', e)
  }
}

let saving = false

export async function savePersisted(): Promise<void> {
  if (!PERSIST_URL || saving) return
  saving = true
  try {
    const s = CampfireState.get(stateEntity)
    const body: Persisted = {
      totalLogs: s.totalLogs,
      savedCount: s.savedCount,
      level: s.level,
      updatedAt: Date.now()
    }
    await fetch(url(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (e) {
    console.error('[campfire] persistence save skipped', e)
  } finally {
    saving = false
  }
}
