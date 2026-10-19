import type { Contributor } from '@pikku/core/contributors'
import { logHook } from './hook-log.js'

/** Only a teardown: fine on a Worker, where it can never run, but worth a warning. */
export const hookStopOnly: Contributor = {
  provides: ['hookStopOnly'],
  run: (services) => {
    services.hookStopOnly = true
  },
  onServerStop: () => logHook('stop:hook-stop-only'),
}
