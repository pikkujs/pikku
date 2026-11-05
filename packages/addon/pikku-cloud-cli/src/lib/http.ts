/**
 * Type-safe RPC client for the cloud API. Names and types come from the
 * published contract in `../contract/` (refresh with `bun run sync-contract`);
 * see `rpc-client.ts` for how a bare name becomes `cloud:<name>`.
 */
import { CloudRPC } from './rpc-client.js'

export { cloudRpcName } from './rpc-client.js'

export function getCloudRPC(opts: {
  apiUrl: string
  token: string | null
}): CloudRPC {
  const rpc = new CloudRPC()
  rpc.setServerUrl(opts.apiUrl)
  rpc.setAuthorizationJWT(opts.token)
  return rpc
}
