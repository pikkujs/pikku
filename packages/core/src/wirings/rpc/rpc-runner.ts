import { CoreServices, PikkuWire } from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ForbiddenError } from '../../errors/errors.js'
import { PikkuRPC, ResolvedFunction } from './rpc-types.js'

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
  const packageName = externalPackages.get(namespace)
  if (!packageName) {
    return null
  }

  return {
    package: packageName,
    function: functionName,
  }
}

const getPikkuFunctionName = (rpcName: string): string => {
  const rpc = pikkuState(null, 'rpc', 'meta')
  const rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    throw new Error(`RPC function not found: ${rpcName}`)
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
    }
  ) {}

  public async rpcExposed(funcName: string, data: any): Promise<any> {
    const functionMeta = pikkuState(null, 'function', 'meta')[funcName]
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
        // TODO: this is a hack since services have already been created
        // but is valid since we don't want to keep creating new wire services
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
    const funcName = funcMeta.pikkuFuncName || resolved.function

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
    input: In
  ): Promise<{ runId: string }> {
    if (!this.services.workflowService) {
      throw new Error('WorkflowService service not available')
    }
    return this.services.workflowService.startWorkflow(
      workflowName,
      input,
      this
    )
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
    requiresAuth?: boolean | undefined,
    depth: number = 0
  ): TypedRPC {
    const serviceRPC = new ContextAwareRPCService(services, wire, {
      requiresAuth,
    })
    return {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
      invokeExposed: serviceRPC.rpc.bind(serviceRPC),
      startWorkflow: serviceRPC.startWorkflow.bind(serviceRPC),
      rpcWithWire: serviceRPC.rpcWithWire.bind(serviceRPC),
    } as any
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()
