import { pikkuState } from './pikku-state.js'

/**
 * Reads one variable without `process`, which edge runtimes do not have.
 *
 * Looks in the registered singleton services' `variables` service first, then
 * in `process.env` when there is one. Never throws: services that were never
 * registered (a unit test, an early boot path) simply fall through, which is
 * why this reads the state directly instead of calling
 * `getSingletonServices()`.
 *
 * The read is synchronous, so a `VariablesService` that answers with a Promise
 * is ignored and the lookup falls through to `process.env`.
 */
export const readEnvVariable = (name: string): string | undefined => {
  try {
    const variables = pikkuState(
      null,
      'package',
      'singletonServices'
    )?.variables
    if (variables) {
      const value: unknown = variables.get(name)
      if (value instanceof Promise) {
        value.catch(() => {})
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return String(value)
      }
    }
  } catch {
    // A faulty variables service must not take error handling down with it.
  }
  return hasProcessEnv() ? globalThis.process.env[name] : undefined
}

const hasProcessEnv = (): boolean => typeof globalThis.process?.env === 'object'

/**
 * The literal `process.env.NODE_ENV`, kept as a literal on purpose: a deploy
 * adapter pins it with a bundler `define` (a Cloudflare Worker is always
 * production), and `define` only rewrites this exact expression, not
 * `process.env[name]`. Without that define it reads the real value, and on a
 * runtime with no `process` the ReferenceError means "unknown".
 */
const buildTimeNodeEnv = (): string | undefined => {
  try {
    return process.env.NODE_ENV
  } catch {
    return undefined
  }
}

/**
 * `NODE_ENV` decides whether error details are exposed. With neither a
 * variables service nor `process` to say, this is production: failing closed
 * means an edge deployment never leaks error details by accident.
 */
export const isProduction = (): boolean => {
  const nodeEnv = buildTimeNodeEnv() ?? readEnvVariable('NODE_ENV')
  if (nodeEnv !== undefined) return nodeEnv === 'production'
  return !hasProcessEnv()
}
