import type { Contributor } from '@pikku/core/contributors'
import { logHook, maybeFail } from './hook-log.js'

export const hookA: Contributor = {
  provides: ['hookA'],
  run: (services) => {
    services.hookA = 'a'
  },
  onServerStart: async () => {
    await logHook('start:hook-a')
    maybeFail('start', 'hook-a')
  },
  onServerStop: async () => {
    await logHook('stop:hook-a')
    maybeFail('stop', 'hook-a')
  },
}
