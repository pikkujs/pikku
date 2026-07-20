import { registerHooks } from 'node:module'

/**
 * Vite resolves CSS imports; Node does not, so a component module pulled into a
 * test fails on the first stylesheet. Stub them — tests here assert graph shape,
 * never styles.
 */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) {
      return {
        format: 'module',
        source: 'export default new Proxy({}, { get: () => "" })',
        shortCircuit: true,
      }
    }
    return next(url, context)
  },
})
