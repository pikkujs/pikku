import {
  CoreServices,
  CoreSingletonServices,
  PikkuWire,
} from '../../types/core.types.js'
import type { SessionService } from '../../services/user-session-service.js'
import type { CoreUserSession } from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ForbiddenError } from '../../errors/errors.js'
import { PikkuError } from '../../errors/error-handler.js'
import { PikkuRPC, ResolvedFunction } from './rpc-types.js'
import { parseVersionedId } from '../../version.js'

export class RPCNotFoundError extends PikkuError {
  public readonly rpcName: string
  constructor(rpcName: string) {
    super(`RPC function not found: ${rpcName}`)
    this.rpcName = rpcName
  }
}
import type { AIAgentInput } from '../ai-agent/ai-agent.types.js'
import { runAIAgent } from '../ai-agent/ai-agent-runner.js'

/**
 * Resolve a namespaced function reference to package and function names
 * Uses pikkuState to look up the namespace -> package mapping
 */
const resolveNamespace = (
  namespacedFunction: string
): ResolvedFunction | null => {
  const colonIndex = namespacedFunction.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const namespace = namespacedFunction.substring(0, colonIndex)
  const functionName = namespacedFunction.substring(colonIndex + 1)

  const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
  const pkgConfig = externalPackages.get(namespace)
  if (!pkgConfig) {
    return null
  }

  return {
    package: pkgConfig.package,
    function: functionName,
  }
}

const getPikkuFunctionName = (rpcName: string): string => {
  const rpc = pikkuState(null, 'rpc', 'meta')
  let rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    const { baseName, version } = parseVersionedId(rpcName)
    if (version !== null) {
      rpcMeta = rpc[baseName]
    }
  }
  if (!rpcMeta) {
    throw new RPCNotFoundError(rpcName)
  }
  return rpcMeta
}

// Context-aware RPC client for use within services
export class ContextAwareRPCService {
  constructor(
    private services: CoreServices,
    private wire: PikkuWire,
    private options: {
      requiresAuth?: boolean
      sessionService?: SessionService<CoreUserSession>
    }
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
      functionMeta = pikkuState(null, 'function', 'meta')[funcName]
    }
    if (!functionMeta) {
      throw new Error(`Function not found: ${funcName}`)
    }
    if (!functionMeta.expose) {
      throw new ForbiddenError()
    }
    return await this.rpc(funcName, data)
  }

  public async rpc<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    const rpcDepth = this.wire.rpc?.depth || 0
    const updatedWire: PikkuWire = {
      ...this.wire,
      rpc: this.wire.rpc
        ? {
            ...this.wire.rpc,
            depth: rpcDepth + 1,
            global: false,
          }
        : undefined,
    }

    // Check if it's a namespaced function call (e.g., 'stripe:createCharge')
    if (funcName.includes(':')) {
      return this.invokeExternalPackageFunction<In, Out>(
        funcName,
        data,
        updatedWire
      )
    }

    // Main package function
    return runPikkuFunc<In, Out>(
      'rpc',
      funcName,
      getPikkuFunctionName(funcName),
      {
        auth: this.options.requiresAuth,
        singletonServices: this.services,
        data: () => data,
        wire: updatedWire,
      }
    )
  }

  /**
   * Invoke a function from an external package
   * External packages register their functions in pikkuState under their package name.
   * The function is executed using the parent services (shared singleton services).
   * @private
   */
  private async invokeExternalPackageFunction<In = any, Out = any>(
    namespacedFunction: string,
    data: In,
    wire: PikkuWire
  ): Promise<Out> {
    // Resolve namespace to package name
    const resolved = resolveNamespace(namespacedFunction)
    if (!resolved) {
      throw new Error(
        `Unknown namespace in function reference: ${namespacedFunction}. ` +
          `Make sure the package is registered in externalPackages config.`
      )
    }

    // Get the function meta from the external package
    // External packages use function meta, not RPC meta
    const externalFunctionMeta = pikkuState(
      resolved.package,
      'function',
      'meta'
    )
    const funcMeta = externalFunctionMeta[resolved.function]
    if (!funcMeta) {
      throw new Error(
        `Function '${resolved.function}' not found in package '${resolved.package}'. ` +
          `Available functions: ${Object.keys(externalFunctionMeta).join(', ') || '(none)'}`
      )
    }
    const funcName = funcMeta.pikkuFuncId || resolved.function

    // Execute the function using runPikkuFunc with the external package's state
    // We use the parent services (this.services) since external packages share services
    // Pass the function's tags so tag-based middleware/permissions are applied
    return runPikkuFunc<In, Out>('rpc', namespacedFunction, funcName, {
      auth: this.options.requiresAuth,
      singletonServices: this.services,
      data: () => data,
      wire,
      packageName: resolved.package,
      tags: funcMeta.tags,
    })
  }

  public async rpcWithWire<In = any, Out = any>(
    rpcName: string,
    data: In,
    wire: PikkuWire
  ): Promise<Out> {
    const rpcDepth = this.wire.rpc?.depth || 0
    const mergedWire: PikkuWire = {
      ...this.wire,
      ...wire,
      rpc: this.wire.rpc
        ? {
            ...this.wire.rpc,
            depth: rpcDepth + 1,
            global: false,
          }
        : undefined,
    }
    return runPikkuFunc<In, Out>(
      'rpc',
      rpcName,
      getPikkuFunctionName(rpcName),
      {
        auth: this.options.requiresAuth,
        singletonServices: this.services,
        data: () => data,
        wire: mergedWire,
      }
    )
  }

  public async startWorkflow<In = any>(
    workflowName: string,
    input: In,
    options?: { startNode?: string }
  ): Promise<{ runId: string }> {
    if (!this.services.workflowService) {
      throw new Error('WorkflowService service not available')
    }
    return this.services.workflowService.startWorkflow(
      workflowName,
      input,
      this,
      options
    )
  }

  public async agent(
    agentName: string,
    input: AIAgentInput
  ): Promise<{
    runId: string
    result: unknown
    usage: { inputTokens: number; outputTokens: number }
  }> {
    const result = await runAIAgent(agentName, input, {
      singletonServices: this.services as CoreSingletonServices,
      sessionService: this.options.sessionService,
    })
    return {
      runId: result.runId,
      result: result.object ?? result.text,
      usage: result.usage,
    }
  }

  public async remote<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    let endpoint: string | undefined
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const colonIndex = funcName.indexOf(':')
    if (colonIndex !== -1) {
      const namespace = funcName.substring(0, colonIndex)
      const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
      const pkgConfig = externalPackages.get(namespace)
      endpoint = pkgConfig?.rpcEndpoint
    }

    if (!endpoint && this.services.deploymentService) {
      const deployments =
        await this.services.deploymentService.findFunction(funcName)
      if (deployments.length > 0) {
        endpoint = deployments[0].endpoint
      }
    }

    if (!endpoint) {
      throw new Error(
        `No endpoint configured for remote RPC: ${funcName}. ` +
          `Configure rpcEndpoint in externalPackages config or set up a DeploymentService.`
      )
    }

    if (await this.services.secrets?.hasSecret('PIKKU_REMOTE_SECRET')) {
      if (!this.services.jwt) {
        throw new Error(
          'PIKKU_REMOTE_SECRET is set but JWT service is not available'
        )
      }
      const token = await this.services.jwt.encode(
        { value: 5, unit: 'minute' },
        { aud: 'pikku-remote', fn: funcName, iat: Date.now() }
      )
      headers.Authorization = `Bearer ${token}`
    }

    const url = `${endpoint}/rpc/${encodeURIComponent(funcName)}`
    const timeoutMs = 30_000
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      let errorBody: string
      try {
        errorBody = JSON.stringify(await response.json())
      } catch {
        errorBody = await response.text()
      }
      throw new Error(
        `Remote RPC call failed: ${response.status} ${response.statusText}. ${errorBody}`
      )
    }

    try {
      return (await response.json()) as Out
    } catch {
      const text = await response.text()
      throw new Error(
        `Remote RPC call returned non-JSON response: ${response.status} ${response.statusText}. ${text}`
      )
    }
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
    wire: PikkuWire,
    requiresAuthOrOptions?:
      | boolean
      | {
          requiresAuth?: boolean
          sessionService?: SessionService<CoreUserSession>
        }
      | undefined,
    depth: number = 0
  ): TypedRPC {
    const options =
      typeof requiresAuthOrOptions === 'object' &&
      requiresAuthOrOptions !== null
        ? requiresAuthOrOptions
        : { requiresAuth: requiresAuthOrOptions }
    const serviceRPC = new ContextAwareRPCService(services, wire, options)
    return {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
      remote: serviceRPC.remote.bind(serviceRPC),
      exposed: serviceRPC.rpcExposed.bind(serviceRPC),
      startWorkflow: serviceRPC.startWorkflow.bind(serviceRPC),
      agent: serviceRPC.agent.bind(serviceRPC),
      rpcWithWire: serviceRPC.rpcWithWire.bind(serviceRPC),
    } as any
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()
