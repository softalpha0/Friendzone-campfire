import { setupSync } from './sync'
import { setupEnvironment } from './environment'
import { setupCampfire } from './campfire'
import { setupWood } from './wood'
import { setupSocial } from './social'
import { setupReactions } from './reactions'
import { setupUi } from './ui'

export function main(): void {
  // Each step is isolated so a failure in one system can't blank the scene.
  const steps: Array<[string, () => void]> = [
    ['environment', setupEnvironment],
    ['campfire', setupCampfire],
    ['wood', setupWood],
    ['sync', setupSync],
    ['social', setupSocial],
    ['reactions', setupReactions],
    ['ui', setupUi]
  ]
  for (const [name, run] of steps) {
    try {
      run()
    } catch (e) {
      console.error(`[campfire] setup failed: ${name}`, e)
    }
  }
}
