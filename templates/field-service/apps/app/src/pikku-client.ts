import { createPikku } from '@pikku/react'
import { PikkuFetch } from '@sdk/api/pikku-fetch.gen'
import { PikkuRPC } from '@sdk/api/pikku-rpc.gen'
import { createMockPikku, registerPikkuMocks } from '@sdk/api/mocks.gen'
import { PikkuRealtime } from '@sdk/api/pikku-realtime.gen'

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
const realPikku = createPikku(PikkuFetch, PikkuRPC, PikkuRealtime, {
  serverUrl: '/api',
})

/*
 * Mock mode, opt-in, and the screens do not know about it: the same hooks run
 * against a different client. `VITE_MOCK=1` answers every call from `.mocks/`
 * (no backend needed); `VITE_MOCK=flagged` answers only the functions declared
 * `mock: true` and sends the rest to the real backend. Unset, this is the real
 * client and nothing else changes.
 */
const mockMode = import.meta.env.VITE_MOCK
if (mockMode) registerPikkuMocks()

export const pikku = mockMode
  ? createMockPikku({
      fallback: realPikku,
      mode: mockMode === 'flagged' ? 'flagged' : 'all',
    })
  : realPikku
