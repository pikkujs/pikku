import { CorePikkuFetch } from '@pikku/fetch'
import type { FlattenedRPCMap } from '../../.pikku/addon/rpc/pikku-rpc-wirings-map.internal.gen.js'
import type { UncontractedRPCMap } from '../contract/uncontracted.js'

/**
 * The cloud API contract: the `cloud:<name>` functions of the map `pikku all`
 * generates from `@pikkustudio/addon-cloud-api` (package.json `pikku.uses.cloud`,
 * pinned in `pikku-addons.lock`, synced into the gitignored `.pikku`). The
 * addon's own functions share that map unprefixed and are filtered out. Run
 * `bun run pikku` before `tsc` or the tests on a fresh checkout.
 */
type ContractRPCMap = {
  [
    K in keyof FlattenedRPCMap as K extends `cloud:${string}` ? K : never
  ]: FlattenedRPCMap[K]
}

/**
 * Every function the CLI calls, by the name the server serves it under:
 * `cloud:<name>` from the contract, plus the few in `uncontracted.ts` that
 * carry their own namespace (or none).
 */
export type CloudRPCMap = ContractRPCMap & UncontractedRPCMap
export type CloudInput<Name extends keyof CloudRPCMap> =
  CloudRPCMap[Name]['input']
export type CloudOutput<Name extends keyof CloudRPCMap> =
  CloudRPCMap[Name]['output']

type IsVoidish<T> = 0 extends 1 & T
  ? false
  : [T] extends [void | null | undefined]
    ? true
    : false

export type CloudInvoke = <Name extends keyof CloudRPCMap>(
  ...args: IsVoidish<CloudRPCMap[Name]['input']> extends true
    ? [name: Name]
    : [name: Name, data: CloudRPCMap[Name]['input']]
) => Promise<CloudRPCMap[Name]['output']>

/** A typed client for the cloud API; a name is sent exactly as given. */
export class CloudRPC {
  pikkuFetch = new CorePikkuFetch()

  setPikkuFetch(pikkuFetch: CorePikkuFetch): void {
    this.pikkuFetch = pikkuFetch
  }

  setServerUrl(serverUrl: string): void {
    this.pikkuFetch.setServerUrl(serverUrl)
  }

  setAuthorizationJWT(jwt: string | null): void {
    this.pikkuFetch.setAuthorizationJWT(jwt)
  }

  invoke = ((name: string, data?: unknown) =>
    this.pikkuFetch.api(`/rpc/${name}`, 'POST', {
      rpcName: name,
      data,
    })) as CloudInvoke
}
