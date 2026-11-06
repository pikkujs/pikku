import {
  INSPECTOR_ENGINES,
  findInspectorBinary,
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

/** Runs `body` under `PIKKU_INSPECTOR=<engine>` and restores the variable. */
export const withEngine = async <T>(
  engine: InspectorEngine,
  body: () => Promise<T> | T
): Promise<T> => {
  const previous = process.env.PIKKU_INSPECTOR
  process.env.PIKKU_INSPECTOR = engine
  try {
    return await body()
  } finally {
    if (previous === undefined) delete process.env.PIKKU_INSPECTOR
    else process.env.PIKKU_INSPECTOR = previous
  }
}
