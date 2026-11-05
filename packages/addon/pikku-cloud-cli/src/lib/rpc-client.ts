import { CorePikkuFetch } from '@pikku/fetch'
import type { FlattenedRPCMap } from '../../.pikku/contract/cloud-api.js'
import {
  UNCONTRACTED_SERVED_AS,
  type UncontractedRPCMap,
} from '../contract/uncontracted.js'

/**
 * The cloud API contract, by bare function name. `scripts/sync-contract.ts`
 * (the package `prebuild`) fetches `@pikkustudio/addon-cloud-api`, pinned in
 * `contract.lock.json`, into the gitignored `.pikku/contract/`. Run
 * `bun run sync-contract` before `tsc` or the tests on a fresh checkout.
 */
type ContractRPCMap = FlattenedRPCMap

/** Every function the CLI can call, by bare name: the contract plus the few it cannot cover. */
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

/**
 * The name production serves a function under. The few calls the contract
 * cannot carry say where they are served; every other name is a contract
 * function, and `CloudInvoke` only lets one through that the synced contract
 * has, so the type check is what catches a name the server does not know.
 */
export function cloudRpcName(name: string): string {
  if (name.includes(':')) return name
  if (Object.hasOwn(UNCONTRACTED_SERVED_AS, name))
    return UNCONTRACTED_SERVED_AS[name as keyof typeof UNCONTRACTED_SERVED_AS]
  return `cloud:${name}`
}

/** A typed client for the cloud API: callers use bare names, the wire gets the served ones. */
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

  invoke = ((name: string, data?: unknown) => {
    const rpcName = cloudRpcName(name)
    return this.pikkuFetch.api(`/rpc/${rpcName}`, 'POST', { rpcName, data })
  }) as CloudInvoke
}
