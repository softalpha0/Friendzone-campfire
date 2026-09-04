import { engine, Entity, GltfContainer, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { setupSync } from './sync'
import { setupEnvironment } from './environment'
import { setupCampfire } from './campfire'
import { setupWood } from './wood'
import { setupSocial } from './social'
import { setupUi } from './ui'

/**
 * The SDK7 template ships a placeholder cube inside main.crdt / main.composite.
 * Remove any renderable content that isn't ours so it can't clash with the
 * scene. Composite entities can stream in a frame or two after main() runs, so
 * we also sweep for a short window afterwards — only ever touching entities we
 * didn't create.
 */
function clearTemplateLeftovers(): void {
  for (const [entity] of engine.getEntitiesWith(MeshRenderer, Transform)) {
    engine.removeEntity(entity)
  }
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
    engine.removeEntity(entity)
  }
}

function guardAgainstLateLeftovers(): void {
  const ours = new Set<Entity>()
  for (const [entity] of engine.getEntitiesWith(MeshRenderer)) ours.add(entity)
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) ours.add(entity)

  let elapsed = 0
  function sweep(dt: number): void {
    elapsed += dt
    for (const [entity] of engine.getEntitiesWith(MeshRenderer)) {
      if (!ours.has(entity)) engine.removeEntity(entity)
    }
    for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
      if (!ours.has(entity)) engine.removeEntity(entity)
    }
    if (elapsed > 3) engine.removeSystem(sweep)
  }
  engine.addSystem(sweep)
}

export function main(): void {
  clearTemplateLeftovers()

  setupSync()
  setupEnvironment()
  setupCampfire()
  setupWood()
  setupSocial()
  setupUi()

  guardAgainstLateLeftovers()
}
