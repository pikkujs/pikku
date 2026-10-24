import type { Contributor } from '@pikku/core/contributors'

/** Registered, never opted in to: its module must not appear in any host file. */
export const unusedDev: Contributor = {
  provides: ['unused'],
  run: (services) => {
    services.unused = true
  },
}
