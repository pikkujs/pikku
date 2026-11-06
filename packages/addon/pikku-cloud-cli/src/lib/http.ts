/**
 * Type-safe RPC client for the cloud API. Names and types come from the
 * published contract, synced by `pikku all` (package.json `pikku.uses.cloud`);
 * see `rpc-client.ts`.
 */
import { CloudRPC } from './rpc-client.js'

export function getCloudRPC(opts: {
  apiUrl: string
  token: string | null
}): CloudRPC {
  const rpc = new CloudRPC()
  rpc.setServerUrl(opts.apiUrl)
  rpc.setAuthorizationJWT(opts.token)
  return rpc
}
