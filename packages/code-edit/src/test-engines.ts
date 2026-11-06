import {
  INSPECTOR_ENGINES,
  findInspectorBinary,
  type InspectorEngine,
} from '@pikku/inspector-go'

/**
 * The inspector engines whose binary can be found here. A missing one is
 * skipped: CI builds both, a developer machine may have built only one.
 */
export const availableEngines = (): InspectorEngine[] =>
  INSPECTOR_ENGINES.filter((engine) => {
    try {
      findInspectorBinary(process.env, { engine })
      return true
    } catch {
      return false
    }
  })

/** `before`/`after` bodies that select `engine` through PIKKU_INSPECTOR. */
export const engineEnv = (engine: InspectorEngine) => {
  const previous = process.env.PIKKU_INSPECTOR
  return {
    select: () => {
      process.env.PIKKU_INSPECTOR = engine
    },
    restore: () => {
      if (previous === undefined) delete process.env.PIKKU_INSPECTOR
      else process.env.PIKKU_INSPECTOR = previous
    },
  }
}
