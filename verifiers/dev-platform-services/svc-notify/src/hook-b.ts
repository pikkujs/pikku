import { defineProvider } from '@pikku/core/provider'
import { logHook, maybeFail } from './hook-log.js'

/** A chain: hook-a, then hook-b needing it, then hook-c. */
export const hookB = defineProvider({
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
