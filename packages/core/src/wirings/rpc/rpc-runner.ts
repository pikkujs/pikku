import type {
  CoreServices,
  PikkuWire,
  PikkuRawWire,
} from '../../types/core.types.js'
import type { SessionService } from '../../services/user-session-service.js'
import type { CoreUserSession } from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import type { AddonInstance } from './addon-runner.js'
import { addonInstanceForNamespace } from './addon-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import type { PikkuRPC, ResolvedFunction } from './rpc-types.js'
import { parseVersionedId } from '../../version.js'
import { resolveRemoteAddonToken } from './remote-addon-auth.js'
import { createAgentRPC } from '../ai-agent/agent-rpc.js'

/**
 * The session for a wire: read through `getSession` when a runner attached one,
 * otherwise whatever was placed on the wire directly.
 */
const resolveWireSession = async (wire: PikkuRawWire) =>
  typeof wire.getSession === 'function' ? await wire.getSession() : wire.session

export class RPCNotFoundError extends PikkuError {
  public readonly rpcName: string
  constructor(rpcName: string) {
    super(`RPC function not found: ${rpcName}`)
    this.rpcName = rpcName
  }
}
addError(RPCNotFoundError, {
  status: 404,
  mcpCode: -32601,
  message: 'RPC function not found.',
})

export class RemoteAddonConfigError extends PikkuError {
  constructor(namespace: string, detail: string) {
    super(`Remote addon '${namespace}' is misconfigured: ${detail}`)
  }
}
addError(RemoteAddonConfigError, {
  status: 500,
  message: 'Remote addon is misconfigured.',
})

export class RemoteAddonRequestError extends PikkuError {
  public readonly httpStatus: number
  constructor(
    namespace: string,
    fnName: string,
    status: number,
    detail: string
  ) {
    super(
      `Remote addon '${namespace}:${fnName}' returned ${status}${detail ? `: ${detail}` : ''}`
    )
    this.httpStatus = status
  }
}
addError(RemoteAddonRequestError, {
  status: 502,
  message: 'Remote addon request failed.',
})

export const resolveNamespace = (
  namespacedFunction: string
): ResolvedFunction | null => {
  const colonIndex = namespacedFunction.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const namespace = namespacedFunction.substring(0, colonIndex)
  const functionName = namespacedFunction.substring(colonIndex + 1)

  const addons = pikkuState(null, 'addons', 'packages')
  const pkgConfig = addons.get(namespace)
  if (!pkgConfig) {
    return null
  }

  return {
    package: pkgConfig.package,
    function: functionName,
    addonConfig: pkgConfig,
  }
}

const resolvePikkuFunction = (
  rpcName: string,
  packageName: string | null = null
): { pikkuFuncId: string; packageName: string | null } => {
  if (packageName) {
    const pkgFunctions = pikkuState(packageName, 'function', 'meta')
    const pkgMeta = pkgFunctions?.[rpcName]
    if (pkgMeta) {
      return { pikkuFuncId: pkgMeta.pikkuFuncId || rpcName, packageName }
    }
  }
  const rpc = pikkuState(null, 'rpc', 'meta')
  let rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    const { baseName, version } = parseVersionedId(rpcName)
    if (version !== null) {
      rpcMeta = rpc[baseName]
    }
  }
  if (!rpcMeta) {
    const rootFunctions = pikkuState(null, 'function', 'meta')
    const rootFunctionMeta = rootFunctions?.[rpcName]
    if (rootFunctionMeta) {
      return {
        pikkuFuncId: rootFunctionMeta.pikkuFuncId || rpcName,
        packageName: null,
      }
    }
  }
  if (!rpcMeta) {
    throw new RPCNotFoundError(rpcName)
  }
  return { pikkuFuncId: rpcMeta, packageName: null }
}

/**
 * Marks an addon RPC name that could not be resolved. Module-private on purpose:
 * resolution failure must never be conflated with an `RPCNotFoundError` thrown by
 * a function that already started executing, and it must never escape to callers.
 */
const NOT_RESOLVED = Symbol('pikku:rpc-not-resolved')

type AddonCall =
  | {
      kind: 'remote'
      namespace: string
      fnName: string
      addonConfig: ResolvedFunction['addonConfig']
    }
  | {
      kind: 'local'
      namespacedFunction: string
      packageName: string
      pikkuFuncId: string
      auth: boolean | undefined
      tags: string[]
      addonInstance: AddonInstance
    }

export class ContextAwareRPCService {
  constructor(
    private services: CoreServices,
    private wire: PikkuRawWire,
    private options: {
      requiresAuth?: boolean
      sessionService?: SessionService<CoreUserSession>
    },
    private packageName: string | null = null
  ) {}

  public async rpcExposed(funcName: string, data: any): Promise<any> {
    let functionMeta: any
    if (funcName.includes(':')) {
      const resolved = resolveNamespace(funcName)
      if (resolved) {
        functionMeta = pikkuState(resolved.package, 'function', 'meta')[
          resolved.function
        ]
      }
    } else {
      const resolved = resolvePikkuFunction(funcName, this.packageName)
      functionMeta = pikkuState(resolved.packageName, 'function', 'meta')[
        resolved.pikkuFuncId
      ]
    }
    if (!functionMeta) {
      throw new RPCNotFoundError(funcName)
    }
    if (!functionMeta.expose || functionMeta.scenarioStep) {
      throw new RPCNotFoundError(funcName)
    }
    return await this.rpc(funcName, data)
  }

  public async rpc<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    const updatedWire: PikkuRawWire = {
      ...this.wire,
    }

    if (funcName.includes(':')) {
      const addonCall = this.resolveAddonFunction(funcName)
      if (addonCall !== NOT_RESOLVED) {
        return await this.executeAddonFunction<In, Out>(
          addonCall,
          data,
          updatedWire
        )
      }
    }

    let resolved: { pikkuFuncId: string; packageName: string | null }
    try {
      resolved = resolvePikkuFunction(funcName, this.packageName)
    } catch (e) {
      if (e instanceof RPCNotFoundError) {
        if (this.services.deploymentService) {
          const session = await resolveWireSession(this.wire)
          return this.services.deploymentService.invoke(
            funcName,
            data,
            session,
            this.wire.traceId
          ) as Promise<Out>
        }
      }
      throw e
    }

    const addonInstance = resolved.packageName
      ? addonInstanceForNamespace(
          this.wire.addonNamespace,
          resolved.packageName
        )
      : undefined
    return await runPikkuFunc<In, Out>('rpc', funcName, resolved.pikkuFuncId, {
      auth: this.options.requiresAuth,
      singletonServices: this.services,
      data: () => data,
      wire: updatedWire,
      packageName: resolved.packageName,
      addonInstance,
    })
  }

  /**
   * Resolution half of an addon RPC call: never executes anything, so an
   * `RPCNotFoundError` thrown by the function itself can never be mistaken for
   * an unresolvable name.
   */
  private resolveAddonFunction(
    namespacedFunction: string
  ): AddonCall | typeof NOT_RESOLVED {
    const resolved = resolveNamespace(namespacedFunction)
    if (!resolved) {
      return NOT_RESOLVED
    }

    const namespace = namespacedFunction.slice(
      0,
      namespacedFunction.indexOf(':')
    )

    if (resolved.addonConfig?.remote) {
      const addonConfig = pikkuState(null, 'addons', 'packages').get(namespace)
      if (!addonConfig?.remote) {
        return NOT_RESOLVED
      }
      return {
        kind: 'remote',
        namespace,
        fnName: resolved.function,
        addonConfig,
      }
    }

    const addonFunctionMeta = pikkuState(resolved.package, 'function', 'meta')
    const funcMeta = addonFunctionMeta[resolved.function]
    if (!funcMeta) {
      return NOT_RESOLVED
    }

    return {
      kind: 'local',
      namespacedFunction,
      packageName: resolved.package,
      pikkuFuncId: funcMeta.pikkuFuncId || resolved.function,
      auth: resolved.addonConfig?.auth ?? this.options.requiresAuth,
      tags: [...(resolved.addonConfig?.tags ?? []), ...(funcMeta.tags ?? [])],
      addonInstance: {
        namespace,
        secretOverrides: resolved.addonConfig?.secretOverrides,
        variableOverrides: resolved.addonConfig?.variableOverrides,
        credentialOverrides: resolved.addonConfig?.credentialOverrides,
      },
    }
  }

  /**
   * Execution half of an addon RPC call. Must never be called from inside a
   * `try` that catches `RPCNotFoundError`.
   */
  private async executeAddonFunction<In = any, Out = any>(
    addonCall: AddonCall,
    data: In,
    wire: PikkuRawWire
  ): Promise<Out> {
    if (addonCall.kind === 'remote') {
      return this.invokeRemoteAddonFunction<In, Out>(
        addonCall.namespace,
        addonCall.fnName,
        data,
        addonCall.addonConfig
      )
    }

    return runPikkuFunc<In, Out>(
      'rpc',
      addonCall.namespacedFunction,
      addonCall.pikkuFuncId,
      {
        auth: addonCall.auth,
        singletonServices: this.services,
        data: () => data,
        wire,
        packageName: addonCall.packageName,
        tags: addonCall.tags,
        addonInstance: addonCall.addonInstance,
      }
    )
  }

  private async invokeRemoteAddonFunction<In = any, Out = any>(
    namespace: string,
    fnName: string,
    data: In,
    cfg: ResolvedFunction['addonConfig']
  ): Promise<Out> {
    const serverUrl =
      typeof cfg.serverUrl === 'function'
        ? await cfg.serverUrl(this.services)
        : cfg.serverUrl
    if (!serverUrl) {
      throw new RemoteAddonConfigError(namespace, 'serverUrl resolved empty')
    }

    const remoteFn = cfg.remoteName ? cfg.remoteName(fnName) : fnName
    const token = await resolveRemoteAddonToken(
      cfg.remoteAuth,
      this.services,
      this.wire,
      namespace
    )

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    }
    if (token) {
      headers.authorization = `Bearer ${token}`
    }
    if (this.wire.traceId) {
      headers['x-trace-id'] = this.wire.traceId
    }

    const base = serverUrl.replace(/\/+$/, '')
    const res = await fetch(
      `${base}/remote/rpc/${encodeURIComponent(remoteFn)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ rpcName: remoteFn, data }),
      }
    )

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      throw new RemoteAddonRequestError(namespace, remoteFn, res.status, detail)
    }

    if (res.status === 204) {
      return undefined as Out
    }
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as Out
  }

  public async rpcWithWire<In = any, Out = any>(
    rpcName: string,
    data: In,
    wire: PikkuRawWire
  ): Promise<Out> {
    const mergedWire: PikkuRawWire = {
      ...this.wire,
      ...wire,
    }

    if (rpcName.includes(':')) {
      const addonCall = this.resolveAddonFunction(rpcName)
      if (addonCall === NOT_RESOLVED) {
        throw new RPCNotFoundError(rpcName)
      }
      return this.executeAddonFunction<In, Out>(addonCall, data, mergedWire)
    }

    let resolved: { pikkuFuncId: string; packageName: string | null }
    try {
      resolved = resolvePikkuFunction(rpcName, this.packageName)
    } catch (e) {
      if (e instanceof RPCNotFoundError && this.services.deploymentService) {
        const session = await resolveWireSession(this.wire)
        return this.services.deploymentService.invoke(
          rpcName,
          data,
          session,
          this.wire.traceId
        ) as Promise<Out>
      }
      throw e
    }

    const addonInstance = resolved.packageName
      ? addonInstanceForNamespace(
          this.wire.addonNamespace,
          resolved.packageName
        )
      : undefined
    return await runPikkuFunc<In, Out>('rpc', rpcName, resolved.pikkuFuncId, {
      auth: this.options.requiresAuth,
      singletonServices: this.services,
      data: () => data,
      wire: mergedWire,
      packageName: resolved.packageName,
      addonInstance,
    })
  }

  public async startWorkflow<In = any>(
    workflowName: string,
    input: In,
    options?: {
      startNode?: string
      wire?: { type: string; id?: string; parentRunId?: string }
    }
  ): Promise<{ runId: string }> {
    if (!this.services.workflowService) {
      throw new Error('WorkflowService service not available')
    }
    const parentRunId = this.wire.workflowStep?.runId ?? this.wire.graph?.runId
    const wire = options?.wire ?? {
      type: this.wire.wireType ?? 'unknown',
      id: this.wire.wireId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(this.wire.pikkuUserId ? { pikkuUserId: this.wire.pikkuUserId } : {}),
    }
    return this.services.workflowService.startWorkflow(
      workflowName,
      input,
      wire,
      this,
      options
    )
  }

  /**
   * The agent facade, built on access.
   *
   * The implementation lives in `ai-agent/agent-rpc.ts` so the agent surface is
   * one file rather than a wing of this one; a getter rather than a field so a
   * request that never touches an agent never builds it.
   */
  public get agent(): PikkuRPC['agent'] {
    return createAgentRPC(this.wire, this.options)
  }

  public async remote<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    if (!this.services.deploymentService) {
      throw new Error(
        `No DeploymentService configured for remote RPC: ${funcName}. ` +
          `Set up a DeploymentService to enable remote function calls.`
      )
    }

    const session = await resolveWireSession(this.wire)

    return this.services.deploymentService.invoke(
      funcName,
      data,
      session,
      this.wire.traceId
    ) as Promise<Out>
  }
}

export class PikkuRPCService<
  Services extends CoreServices,
  TypedRPC = PikkuRPC,
> {
  getContextRPCService(
    services: Services,
    wire: PikkuRawWire,
    requiresAuthOrOptions?:
      | boolean
      | {
          requiresAuth?: boolean
          sessionService?: SessionService<CoreUserSession>
        }
      | undefined,
    depth: number = 0,
    packageName: string | null = null
  ): TypedRPC {
    const options =
      typeof requiresAuthOrOptions === 'object' &&
      requiresAuthOrOptions !== null
        ? requiresAuthOrOptions
        : { requiresAuth: requiresAuthOrOptions }
    const serviceRPC = new ContextAwareRPCService(
      services,
      wire as PikkuWire,
      options,
      packageName
    )
    // `TypedRPC` is named by the caller from its generated RPC map. Nothing
    // concrete can satisfy a type the caller has not chosen yet.
    return new ContextRPCView(serviceRPC, depth) as TypedRPC
  }
}

/**
 * The per-invocation `wire.rpc`.
 *
 * A class rather than an object literal because `agent` has to stay lazy — most
 * requests never touch it — and an accessor declared on an object literal is
 * defined per instance, which drops the literal off V8's fast construction
 * path. Measured at ~1.15µs per request as a literal against ~0.47µs here, on
 * the hot path every request takes.
 *
 * knowledge: decisions/internals/the-per-invocation-rpc-view-is-a-class.md
 */
class ContextRPCView {
  public readonly global = false
  public readonly invoke: ContextAwareRPCService['rpc']
  public readonly remote: ContextAwareRPCService['remote']
  public readonly exposed: ContextAwareRPCService['rpcExposed']
  public readonly startWorkflow: ContextAwareRPCService['startWorkflow']
  public readonly rpcWithWire: ContextAwareRPCService['rpcWithWire']

  constructor(
    private readonly serviceRPC: ContextAwareRPCService,
    public readonly depth: number
  ) {
    this.invoke = serviceRPC.rpc.bind(serviceRPC)
    this.remote = serviceRPC.remote.bind(serviceRPC)
    this.exposed = serviceRPC.rpcExposed.bind(serviceRPC)
    this.startWorkflow = serviceRPC.startWorkflow.bind(serviceRPC)
    this.rpcWithWire = serviceRPC.rpcWithWire.bind(serviceRPC)
  }

  get agent() {
    return this.serviceRPC.agent
  }
}

export const rpcService = new PikkuRPCService()
