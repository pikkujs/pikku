import {
  INSPECTOR_ENGINES,
  findInspectorBinary,
  setInspectorEngine,
  type InspectorEngine,
} from './binary.js'

/**
 * The engines whose binary can be found here, for suites that run the real
 * thing. A missing one is skipped rather than failed: CI builds both, a
 * developer machine may have built only one.
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

/** Runs `body` with `engine` selected, then goes back to Go. */
export const withEngine = async <T>(
  engine: InspectorEngine,
  body: () => Promise<T> | T
): Promise<T> => {
  setInspectorEngine(engine)
  try {
    return await body()
  } finally {
    setInspectorEngine('go')
  }
}
