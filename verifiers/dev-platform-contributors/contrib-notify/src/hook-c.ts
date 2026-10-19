import type { Contributor } from '@pikku/core/contributors'
import { logHook, maybeFail } from './hook-log.js'

/** A chain: hook-a, then hook-b needing it, then hook-c. Registered in reverse. */
export const hookC: Contributor = {
  provides: ['hookC'],
  needs: ['hookB'],
  run: (services) => {
    services.hookC = `${services.hookB}>c`
  },
  onServerStart: () => {
    logHook('start:hook-c')
    maybeFail('start', 'hook-c')
  },
  onServerStop: () => {
    logHook('stop:hook-c')
    maybeFail('stop', 'hook-c')
  },
}
