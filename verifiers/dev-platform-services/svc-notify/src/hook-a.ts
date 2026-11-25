import { defineProvider } from '@pikku/core/provider'
import { logHook, maybeFail } from './hook-log.js'

/** A chain: hook-a, then hook-b needing it, then hook-c. */
export const hookA = defineProvider({
  common: () => ({
    hookA: {
      tag: 'a',
      stop: async () => {
        await logHook('stop:hook-a')
        maybeFail('stop', 'hook-a')
      },
    },
  }),
  onServerStart: async () => {
    await logHook('start:hook-a')
    maybeFail('start', 'hook-a')
  },
})
