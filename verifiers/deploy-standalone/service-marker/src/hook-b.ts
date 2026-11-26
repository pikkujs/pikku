import { pikkuService } from '@pikku/core/pikku-service'
import { logHook, maybeFail } from './hook-log.js'

export const hookB = pikkuService({
  common: ({ hookA }) => ({
    hookB: {
      tag: `${hookA.tag}>b`,
      stop: async () => {
        await logHook('stop:hook-b')
        maybeFail('stop', 'hook-b')
      },
    },
  }),
  onServerStart: async () => {
    await logHook('start:hook-b')
    maybeFail('start', 'hook-b')
  },
})
