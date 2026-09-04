import { engine } from '@dcl/sdk/ecs'
import { triggerEmote } from '~system/RestrictedActions'
import {
  ROAST_BURNT_AT,
  ROAST_PERFECT_MAX,
  ROAST_PERFECT_MIN,
  ROAST_TOTAL
} from './config'
import { local, now, setToast } from './state'
import { identity, sceneBus } from './sync'

export function inviteEveryone(): void {
  const me = identity()
  sceneBus.emit('invite', { name: me.name })
  void triggerEmote({ predefinedEmote: 'raiseHand' })
  setToast('You called everyone to the fire 🔥', 3)
}

export function cheers(): void {
  if (!local.nearFire) {
    setToast('Gather by the fire to raise a toast')
    return
  }
  const me = identity()
  sceneBus.emit('cheers', { name: me.name })
  void triggerEmote({ predefinedEmote: 'clap' })
  setToast('Cheers! 🥂', 2.5)
}

export function warmUp(): void {
  if (!local.nearFire) {
    setToast('Step closer to warm your hands')
    return
  }
  void triggerEmote({ predefinedEmote: 'handsair' })
  setToast('Ahh, warm 🔥', 2.5)
}

// --- Marshmallow roasting (local mini-activity) ---------------------
export function startRoast(): void {
  if (local.roast.active) return
  if (!local.nearFire) {
    setToast('Roast marshmallows next to the fire 🍡')
    return
  }
  local.roast.active = true
  local.roast.t = 0
  local.roast.result = ''
  local.roast.resultUntil = 0
  setToast('Roasting… pull it out at the right moment!', 2.5)
}

export function finishRoast(): void {
  const r = local.roast
  if (!r.active) return
  r.active = false
  r.resultUntil = now() + 2.6
  if (r.t < ROAST_PERFECT_MIN) {
    r.result = 'cold'
    setToast('Still cold — leave it in longer next time')
  } else if (r.t <= ROAST_PERFECT_MAX) {
    r.result = 'perfect'
    setToast('Perfect golden marshmallow! 😋')
    sceneBus.emit('roast', { name: identity().name })
    void triggerEmote({ predefinedEmote: 'clap' })
  } else if (r.t < ROAST_BURNT_AT) {
    r.result = 'perfect'
    setToast('Toasty enough 🍡')
  } else {
    r.result = 'burnt'
    setToast('Burnt to a crisp 🔥😵')
  }
}

function roastSystem(dt: number): void {
  const r = local.roast
  if (!r.active) return
  r.t += dt
  if (r.t >= ROAST_TOTAL) finishRoast()
}

export function setupSocial(): void {
  engine.addSystem(roastSystem)
}
