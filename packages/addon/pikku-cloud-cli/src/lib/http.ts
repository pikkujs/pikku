/**
 * Type-safe RPC client backed by the snapshot SDK in `../sdk/`. The map is
 * a copy of cloud's generated rpc-map at the time of the addon's last
 * release — versioning bumps are taken by republishing this package.
 *
 * Production serves the cloud API functions under the `cloud:` addon prefix;
 * only the functions that live in api-functions itself are served bare.
 */
import { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

/**
 * WORKAROUND, not the real fix. The snapshot SDK in `../sdk/` is a stale
 * hand-copied map that still uses bare names, and there is no generated map
 * with `cloud:` keys to regenerate it from. So the prefix is applied here from
 * a hand-kept list: anything not listed is assumed to be `cloud:`. If the
 * controlplane moves another function, this goes stale and the CLI 404s again.
 * Proper fix: regenerate the snapshot SDK from the controlplane's real map so
 * names and types come from the server, then delete this list.
 */
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
