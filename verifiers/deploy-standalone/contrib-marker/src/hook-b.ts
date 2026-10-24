import type { Contributor } from '@pikku/core/contributors'
import { logHook, maybeFail } from './hook-log.js'

export const hookB: Contributor = {
  provides: ['hookB'],
  needs: ['hookA'],
  run: (services) => {
    services.hookB = `${services.hookA}>b`
  },
  onServerStart: () => {
    logHook('start:hook-b')
    maybeFail('start', 'hook-b')
  },
  onServerStop: () => {
    logHook('stop:hook-b')
    maybeFail('stop', 'hook-b')
  },
}
