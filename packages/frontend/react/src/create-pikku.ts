import type { CorePikkuFetch, CorePikkuFetchOptions } from '@pikku/fetch'
import type { PikkuInstance } from './pikku-provider.js'

export type CreatePikkuOptions = CorePikkuFetchOptions & {
  serverUrl: string
}

export function createPikku<
  Fetch extends CorePikkuFetch,
  RPC extends { setPikkuFetch(fetch: Fetch): void },
>(
  PikkuFetchClass: new (options?: CorePikkuFetchOptions) => Fetch,
  PikkuRPCClass: new () => RPC,
  options: CreatePikkuOptions
): PikkuInstance<Fetch, RPC>
export function createPikku<
  Fetch extends CorePikkuFetch,
  RPC extends { setPikkuFetch(fetch: Fetch): void },
  Realtime extends { setPikkuFetch(fetch: Fetch): void },
>(
  PikkuFetchClass: new (options?: CorePikkuFetchOptions) => Fetch,
  PikkuRPCClass: new () => RPC,
  PikkuRealtimeClass: new () => Realtime,
  options: CreatePikkuOptions
): PikkuInstance<Fetch, RPC> & { realtime: Realtime }
export function createPikku(
  PikkuFetchClass: any,
  PikkuRPCClass: any,
  third: any,
  fourth?: any
): any {
  // Two overloads: with-realtime takes 4 args, without takes 3.
  const PikkuRealtimeClass = fourth !== undefined ? third : undefined
  const options: CreatePikkuOptions = fourth !== undefined ? fourth : third
  const { serverUrl, ...fetchOptions } = options
  const fetch = new PikkuFetchClass(fetchOptions)
  fetch.setServerUrl(serverUrl)
  const rpc = new PikkuRPCClass()
  rpc.setPikkuFetch(fetch)
  if (PikkuRealtimeClass) {
    const realtime = new PikkuRealtimeClass()
    realtime.setPikkuFetch(fetch)
    return { fetch, rpc, realtime }
  }
  return { fetch, rpc }
}
