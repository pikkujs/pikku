import type { CorePikkuFetch, CorePikkuFetchOptions } from '@pikku/fetch'
import type { PikkuInstance } from './pikku-provider.js'

export type CreatePikkuOptions = CorePikkuFetchOptions & {
  serverUrl: string
}

export const createPikku = <
  Fetch extends CorePikkuFetch,
  RPC extends { setPikkuFetch(fetch: Fetch): void },
>(
  PikkuFetchClass: new (options?: CorePikkuFetchOptions) => Fetch,
  PikkuRPCClass: new () => RPC,
  options: CreatePikkuOptions
): PikkuInstance<Fetch, RPC> => {
  const { serverUrl, ...fetchOptions } = options
  const fetch = new PikkuFetchClass(fetchOptions)
  fetch.setServerUrl(serverUrl)
  const rpc = new PikkuRPCClass()
  rpc.setPikkuFetch(fetch)
  return { fetch, rpc }
}
