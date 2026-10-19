import type { Contributor } from '@pikku/core/contributors'
import { logHook, maybeFail } from './hook-log.js'

export const hookA: Contributor = {
  provides: ['hookA'],
  run: (services) => {
    services.hookA = 'a'
  },
  onServerStart: () => {
    logHook('start:hook-a')
    maybeFail('start', 'hook-a')
  },
  onServerStop: () => {
    logHook('stop:hook-a')
    maybeFail('stop', 'hook-a')
  },
}
