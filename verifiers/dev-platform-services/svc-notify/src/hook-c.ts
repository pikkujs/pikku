import { defineProvider } from '@pikku/core/provider'
import { logHook, maybeFail } from './hook-log.js'

/** A chain: hook-a, then hook-b needing it, then hook-c. */
export const hookC = defineProvider({
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
