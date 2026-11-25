import { defineProvider } from '@pikku/core/provider'
import { logHook } from './hook-log.js'

/**
 * Only a teardown, no `onServerStart`: a Worker never runs the server
 * lifecycle, but it has nothing to start, so the build accepts it there.
 */
export const hookStopOnly = defineProvider({
  deploy: () => ({
    hookStopOnly: { stop: async () => logHook('stop:hook-stop-only') },
  }),
})
