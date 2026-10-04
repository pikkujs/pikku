import { PikkuFetch } from '@project/functions-sdk/pikku/pikku-fetch.gen'
import { PikkuRPC } from '@project/functions-sdk/pikku/pikku-rpc.gen'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeader, getRequestUrl } from '@tanstack/react-start/server'
import { apiUrl } from './env'
import { dispatchFetch } from './fabric-dispatch'

/**
 * A PikkuRPC client for code that runs OUTSIDE React — route `beforeLoad` gates, mostly.
 * Components use the usePikku* hooks and the provider in __root.tsx instead.
 *
 * `beforeLoad` runs on BOTH sides, so this has two implementations and
 * `createIsomorphicFn` keeps each out of the other's bundle. The browser reuses one
 * client. The server builds a fresh one per request and forwards that request's own
 * cookie header — a module-scope singleton there would serve one visitor's session to
 * the next. Deployed, the API answers on the same hostname under `/api`, so the request
 * URL is the base; local dev has VITE_API_URL at build time and points straight at it.
 */
let client: PikkuRPC | null = null

const resolveRpc = createIsomorphicFn()
  .client((): PikkuRPC => {
    if (!client) {
      client = new PikkuRPC()
      client.setServerUrl(apiUrl())
    }
    return client
  })
  .server((): PikkuRPC => {
    const perRequest = new PikkuRPC()
    if (dispatchFetch) {
      perRequest.setPikkuFetch(new PikkuFetch({ fetch: dispatchFetch }))
    }
    perRequest.setServerUrl(
      import.meta.env.VITE_API_URL ?? new URL('/api', getRequestUrl()).toString(),
    )
    const cookie = getRequestHeader('cookie')
    if (cookie) perRequest.pikkuFetch.setHeader('cookie', cookie)
    return perRequest
  })

export function rpc(): PikkuRPC {
  return resolveRpc()
}

/**
 * Is this the server's SIGNED-OUT answer?
 *
 * Pikku answers a missing session with `ForbiddenError('Authentication required')` — a 403,
 * not a 401 — so a status-only check reads it as a real failure and the gate rethrows
 * instead of redirecting. Every signed-out visitor to a gated route got a stack trace where
 * the login form belongs. A 403 carrying any other message IS a genuine permission denial
 * ('Permission denied'), and bouncing a signed-IN user to login on one of those would loop.
 */
export function isUnauthorized(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { status, message } = error as { status?: number; message?: string }
  return status === 401 || (status === 403 && message === 'Authentication required')
}
