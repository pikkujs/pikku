/**
 * Type-safe RPC client backed by the snapshot SDK in `../sdk/`. The map is
 * a copy of fabric's generated rpc-map at the time of the addon's last
 * release — versioning bumps are taken by republishing this package.
 */
import { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

export function getRpc(opts: {
  apiUrl: string
  token: string | null
}): PikkuRPC {
  const rpc = new PikkuRPC()
  rpc.setServerUrl(opts.apiUrl)
  rpc.setAuthorizationJWT(opts.token)
  return rpc
}
