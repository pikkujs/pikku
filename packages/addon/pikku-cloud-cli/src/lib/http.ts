/**
 * Type-safe RPC client backed by the snapshot SDK in `../sdk/`. The map is
 * a copy of cloud's generated rpc-map at the time of the addon's last
 * release — versioning bumps are taken by republishing this package.
 *
 * Production serves the cloud API functions under the `cloud:` addon prefix;
 * only the functions that live in api-functions itself are served bare.
 */
import { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

const BARE_RPCS = new Set(['requestCliAuth', 'pollCliAuth', 'submitFinding'])
const MACHINE_RPCS = new Set(['createSandboxChange'])

export function cloudRpcName(name: string): string {
  if (name.includes(':') || BARE_RPCS.has(name)) return name
  return `${MACHINE_RPCS.has(name) ? 'machine' : 'cloud'}:${name}`
}

export function getCloudRPC(opts: {
  apiUrl: string
  token: string | null
}): PikkuRPC {
  const rpc = new PikkuRPC()
  rpc.setServerUrl(opts.apiUrl)
  rpc.setAuthorizationJWT(opts.token)
  const invoke = rpc.invoke as (name: string, data?: unknown) => unknown
  rpc.invoke = ((name: string, data?: unknown) =>
    invoke(cloudRpcName(name), data)) as typeof rpc.invoke
  return rpc
}
