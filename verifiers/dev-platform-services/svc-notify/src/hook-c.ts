import { pikkuService } from '@pikku/core/pikku-service'
import { logHook, maybeFail } from './hook-log.js'

/** A chain: hook-a, then hook-b needing it, then hook-c. */
export const hookC = pikkuService({
  common: ({ hookB }) => ({
    hookC: {
      tag: `${hookB.tag}>c`,
      stop: async () => {
        await logHook('stop:hook-c')
        maybeFail('stop', 'hook-c')
      },
    },
  }),
  onServerStart: async () => {
    await logHook('start:hook-c')
    maybeFail('start', 'hook-c')
  },
})
