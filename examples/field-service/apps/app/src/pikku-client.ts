import { createPikku } from '@pikku/react'
import { PikkuFetch } from '../../../.pikku/pikku-fetch.gen'
import { PikkuRPC } from '../../../.pikku/pikku-rpc.gen'
import { PikkuRealtime } from '../../../.pikku/realtime.gen'

/**
 * One client for the whole app, built from the generated classes.
 *
 * `serverUrl` is `/api` because every deployed shape serves the API on the
 * same origin under that prefix, and dev proxies it (see vite.config.ts). A
 * hardcoded host works locally and ships broken.
 *
 * The third argument is what makes `usePikkuRealtime` work at all — without it
 * the hook throws, because there is no realtime client to hand back.
 */
export const pikku = createPikku(PikkuFetch, PikkuRPC, PikkuRealtime, {
  serverUrl: '/api',
})
