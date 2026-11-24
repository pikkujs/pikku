import { pikkuService } from '@pikku/core/pikku-service'
import { logHook } from './hook-log.js'

/**
 * Only a teardown, no `onServerStart`: a Worker never runs the server
 * lifecycle, but it has nothing to start, so the build accepts it there.
 */
export const hookStopOnly = pikkuService({
  deploy: () => ({
    hookStopOnly: { stop: async () => logHook('stop:hook-stop-only') },
  }),
})
