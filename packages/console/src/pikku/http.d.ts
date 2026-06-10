import type { PikkuFetch } from './pikku-fetch.gen.js'
import type { PikkuRPC } from './pikku-rpc.gen.js'
export declare const pikku: (options: {
  serverUrl: string
  credentials?: RequestCredentials
}) => {
  fetch: PikkuFetch
  rpc: PikkuRPC
}
