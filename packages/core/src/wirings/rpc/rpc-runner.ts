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

/** A `wireRemoteAddon` namespace is missing a usable `serverUrl`. */
export class RemoteAddonConfigError extends PikkuError {
  constructor(namespace: string, detail: string) {
    super(`Remote addon '${namespace}' is misconfigured: ${detail}`)
  }
}
addError(RemoteAddonConfigError, {
  status: 500,
  message: 'Remote addon is misconfigured.',
})

/** The hosted addon returned a non-2xx response for a remote RPC. */
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
import type { AIAgentInput } from '../ai-agent/ai-agent.types.js'
import type { AIStreamChannel } from '../ai-agent/ai-agent.types.js'
import type { StreamAIAgentOptions } from '../ai-agent/ai-agent-prepare.js'
import { runAIAgent, resumeAIAgentSync } from '../ai-agent/ai-agent-runner.js'
import { streamAIAgent, resumeAIAgent } from '../ai-agent/ai-agent-stream.js'
import { wrapChannelWithAGUI } from '../ai-agent/ai-agent-agui.js'

/**
 * Resolve a namespaced function reference to package and function names
 * Uses pikkuState to look up the namespace -> package mapping
 */
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

/**
 * Resolve a bare (non-namespaced) RPC name to its pikkuFuncId, preferring
 * the caller's addon package when provided. Returns the function name plus
 * the package scope that resolved it (null = root), so callers can thread
 * the scope into runPikkuFunc without a second lookup.
 */
const resolvePikkuFunction = (
  rpcName: string,
  packageName: string | null = null
): { pikkuFuncId: string; packageName: string | null } => {
  // Addon-scoped calls: try the caller's package function meta first.
  // (RPC meta only lives in root; addon functions are registered under their package.)
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

// Context-aware RPC client for use within services
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
    if (!functionMeta.expose) {
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

    // Check addon namespace first (e.g. 'stripe:createCharge')
    if (funcName.includes(':')) {
      try {
        return await this.invokeAddonFunction<In, Out>(
          funcName,
          data,
          updatedWire
        )
      } catch (addonErr) {
        if (!(addonErr instanceof RPCNotFoundError)) throw addonErr
        // Not an addon — fall through to local lookup
      }
    }

    // Bare name: resolve via caller's package scope first (if any), then root.
    // Note: intra-addon bare calls do NOT re-apply the addon's external
    // addonConfig.auth/tags — those gates are only applied on the external
    // 'namespace:func' boundary via invokeAddonFunction.
    try {
      const resolved = resolvePikkuFunction(funcName, this.packageName)
      const addonInstance = resolved.packageName
        ? addonInstanceForNamespace(
            this.wire.addonNamespace,
            resolved.packageName
          )
        : undefined
      return await runPikkuFunc<In, Out>(
        'rpc',
        funcName,
        resolved.pikkuFuncId,
        {
          auth: this.options.requiresAuth,
          singletonServices: this.services,
          data: () => data,
          wire: updatedWire,
          packageName: resolved.packageName,
          addonInstance,
        }
      )
    } catch (e) {
      if (e instanceof RPCNotFoundError) {
        // Fall back to deployment service (e.g. CF service binding, Lambda Invoke)
        if (this.services.deploymentService) {
          const session =
            this.wire.getSession && typeof this.wire.getSession === 'function'
              ? await this.wire.getSession()
              : (this.wire as any).session
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
  }

  /**
   * Invoke a function from an addon package
   * Addon packages register their functions in pikkuState under their package name.
   * The function is executed using the parent services (shared singleton services).
   * @private
   */
  private async invokeAddonFunction<In = any, Out = any>(
    namespacedFunction: string,
    data: In,
    wire: PikkuRawWire
  ): Promise<Out> {
    // Resolve namespace to package name
    const resolved = resolveNamespace(namespacedFunction)
    if (!resolved) {
      throw new RPCNotFoundError(namespacedFunction)
    }

    const namespace = namespacedFunction.slice(
      0,
      namespacedFunction.indexOf(':')
    )

    // wireRemoteAddon: the addon ships as a devDependency (types only) and its
    // handlers run on the host — dispatch over HTTP, not through local meta.
    if (resolved.addonConfig?.remote) {
      return this.invokeRemoteAddonFunction<In, Out>(
        namespace,
        resolved.function,
        data
      )
    }

    // Get the function meta from the addon package
    // Addon packages use function meta, not RPC meta
    const addonFunctionMeta = pikkuState(resolved.package, 'function', 'meta')
    const funcMeta = addonFunctionMeta[resolved.function]
    if (!funcMeta) {
      throw new RPCNotFoundError(namespacedFunction)
    }
    const funcName = funcMeta.pikkuFuncId || resolved.function

    const auth = resolved.addonConfig?.auth ?? this.options.requiresAuth
    const tags = [
      ...(resolved.addonConfig?.tags ?? []),
      ...(funcMeta.tags ?? []),
    ]

    // The namespace is the consumer-facing wireAddon name; it selects the
    // per-instance singleton services and secret/variable/credential overrides.
    const addonInstance: AddonInstance = {
      namespace,
      secretOverrides: resolved.addonConfig?.secretOverrides,
      variableOverrides: resolved.addonConfig?.variableOverrides,
      credentialOverrides: resolved.addonConfig?.credentialOverrides,
    }

    // Execute the function using runPikkuFunc with the addon package's state
    // We use the parent services (this.services) since addon packages share services
    // Pass the function's tags so tag-based middleware/permissions are applied
    return runPikkuFunc<In, Out>('rpc', namespacedFunction, funcName, {
      auth,
      singletonServices: this.services,
      data: () => data,
      wire,
      packageName: resolved.package,
      tags,
      addonInstance,
    })
  }

  /**
   * Dispatch a `wireRemoteAddon` RPC over HTTP to the hosting service.
   *
   * The consumer sends the addon's own function name (not the namespaced form)
   * to the host's `/remote/rpc/:rpcName` endpoint, authenticating as a client
   * with the token bound in `wireRemoteAddon({ auth })`. The addon's handlers
   * live on the host, so there is no local function meta to resolve.
   */
  private async invokeRemoteAddonFunction<In = any, Out = any>(
    namespace: string,
    fnName: string,
    data: In
  ): Promise<Out> {
    const cfg = pikkuState(null, 'addons', 'packages').get(namespace)
    if (!cfg?.remote) {
      throw new RPCNotFoundError(`${namespace}:${fnName}`)
    }

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
      // Best-effort body read to enrich the thrown error (mirrors postRpc).
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
      return this.invokeAddonFunction<In, Out>(rpcName, data, mergedWire)
    }

    try {
      const resolved = resolvePikkuFunction(rpcName, this.packageName)
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
    } catch (e) {
      if (e instanceof RPCNotFoundError && this.services.deploymentService) {
        const session =
          this.wire.getSession && typeof this.wire.getSession === 'function'
            ? await this.wire.getSession()
            : (this.wire as any).session
        return this.services.deploymentService.invoke(
          rpcName,
          data,
          session,
          this.wire.traceId
        ) as Promise<Out>
      }
      throw e
    }
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

  public get agent() {
    return {
      run: async (agentName: string, input: AIAgentInput) => {
        const result = await runAIAgent(agentName, input, {
          sessionService: this.options.sessionService,
          getCredential: this.wire.getCredential?.bind(this.wire),
        })
        return {
          runId: result.runId,
          result: result.object ?? result.text,
          usage: result.usage,
          ...(result.status === 'suspended' && {
            status: 'suspended' as const,
            pendingApprovals: result.pendingApprovals,
          }),
        }
      },
      stream: async (
        agentName: string,
        input: {
          message: string
          threadId: string
          resourceId: string
          model?: string
          temperature?: number
        },
        options?: StreamAIAgentOptions
      ) => {
        const channel = this.wire.channel as unknown as AIStreamChannel
        if (!channel) throw new Error('No channel available for streaming')
        let currentRunId: string | undefined
        await streamAIAgent(
          agentName,
          input,
          wrapChannelWithAGUI(channel, {
            threadId: input.threadId,
            getRunId: () => currentRunId,
          }),
          {
            sessionService: this.options.sessionService,
            getCredential: this.wire.getCredential?.bind(this.wire),
          },
          undefined,
          {
            ...options,
            onRunCreated: (runId) => {
              currentRunId = runId
              options?.onRunCreated?.(runId)
            },
          }
        )
      },
      resume: async (
        runId: string,
        input: { toolCallId: string; approved: boolean },
        options?: StreamAIAgentOptions
      ) => {
        const channel = this.wire.channel as unknown as AIStreamChannel
        if (!channel) throw new Error('No channel available for streaming')
        await resumeAIAgent(
          { runId, ...input },
          wrapChannelWithAGUI(channel, { runId }),
          {
            sessionService: this.options.sessionService,
            getCredential: this.wire.getCredential?.bind(this.wire),
          },
          options
        )
      },
      approve: async (
        runId: string,
        approvals: { toolCallId: string; approved: boolean }[],
        expectedAgentName?: string
      ) => {
        const result = await resumeAIAgentSync(
          runId,
          approvals,
          {
            sessionService: this.options.sessionService,
          },
          expectedAgentName
        )
        return {
          runId: result.runId,
          result: result.object ?? result.text,
          usage: result.usage,
          ...(result.status === 'suspended' && {
            status: 'suspended' as const,
            pendingApprovals: result.pendingApprovals,
          }),
        }
      },
    }
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

    const session =
      this.wire.getSession && typeof this.wire.getSession === 'function'
        ? await this.wire.getSession()
        : (this.wire as any).session

    return this.services.deploymentService.invoke(
      funcName,
      data,
      session,
      this.wire.traceId
    ) as Promise<Out>
  }
}

// RPC Service class for the global interface
export class PikkuRPCService<
  Services extends CoreServices,
  TypedRPC = PikkuRPC,
> {
  // Convenience function for initializing
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
    return {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
      remote: serviceRPC.remote.bind(serviceRPC),
      exposed: serviceRPC.rpcExposed.bind(serviceRPC),
      startWorkflow: serviceRPC.startWorkflow.bind(serviceRPC),
      get agent() {
        return serviceRPC.agent
      },
      rpcWithWire: serviceRPC.rpcWithWire.bind(serviceRPC),
    } as any
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()
