import { PikkuFetch } from './pikku-fetch.gen.js'
import { PikkuRPC } from './pikku-rpc.gen.js'

export const pikku = (options: {
  serverUrl: string
  credentials?: RequestCredentials
}) => {
  const fetch = new PikkuFetch()
  fetch.setServerUrl(options.serverUrl)
  const rpc = new PikkuRPC()
  rpc.setPikkuFetch(fetch)
  return { fetch, rpc }
}
