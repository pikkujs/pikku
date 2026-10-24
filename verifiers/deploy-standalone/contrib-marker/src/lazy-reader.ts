import type { Contributor } from '@pikku/core/contributors'

/**
 * Keeps the services bag it was handed and reads `hookB` from it later. It does
 * not need `hookB`, so it runs before it: it only sees the value if `run` got
 * the live bag rather than a copy.
 */
export const lazyReaderDeploy: Contributor = {
  provides: ['lazyReader'],
  run: (services) => {
    services.lazyReader = { readHookB: () => services.hookB }
  },
}
