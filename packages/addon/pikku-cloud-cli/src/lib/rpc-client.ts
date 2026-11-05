import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { CorePikkuFetch } from '@pikku/fetch'
import type { FlattenedRPCMap } from '../contract/cloud-api.gen.js'
import {
  CLOUD_CONTRACT_RPCS,
  CLOUD_NAMESPACE,
} from '../contract/cloud-api.meta.gen.js'
import {
  UNCONTRACTED_NAMESPACE,
  type UncontractedRPCMap,
} from '../contract/uncontracted.js'

/** Every function the CLI can call, by bare name: the contract plus the few it cannot cover. */
export type CloudRPCMap = FlattenedRPCMap & UncontractedRPCMap

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
 * The name production serves a function under. Contract functions come from
 * the generated contract (`cloud:`), the rest from {@link UNCONTRACTED_NAMESPACE};
 * a name in neither is refused here rather than sent to 404.
 */
export function cloudRpcName(name: string): string {
  if (name.includes(':')) return name
  if (Object.hasOwn(UNCONTRACTED_NAMESPACE, name)) {
    const ns = UNCONTRACTED_NAMESPACE[name as keyof UncontractedRPCMap]
    return ns ? `${ns}:${name}` : name
  }
  if (CLOUD_CONTRACT_RPCS.has(name)) return `${CLOUD_NAMESPACE}:${name}`
  throw new CloudPreconditionError(
    `'${name}' is not in the cloud API contract. Run \`bun run sync-contract\` if it is new, or add it to contract/uncontracted.ts if the contract cannot carry it.`
  )
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
