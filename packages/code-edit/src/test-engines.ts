import {
  INSPECTOR_ENGINES,
  findInspectorBinary,
  setInspectorEngine,
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

/** `before`/`after` bodies that select `engine` for the inspector package. */
export const engineEnv = (engine: InspectorEngine) => ({
  select: () => setInspectorEngine(engine),
  restore: () => setInspectorEngine('go'),
})
