import {
  CoreServices,
  PikkuWire,
  CoreSingletonServices,
} from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ForbiddenError } from '../../errors/errors.js'
import { PikkuRPC, ResolvedFunction } from './rpc-types.js'
import { packageLoader } from '../../packages/package-loader.js'

// Type for the RPC service configuration
type RPCServiceConfig = {
  coerceDataFromSchema: boolean
  externalPackages?: Record<string, string>
}

// Global namespace alias mapping
let aliasToPackage: Map<string, string> = new Map()

/**
 * Resolve a namespaced function reference to package and function names
 */
const resolveNamespace = (namespacedFunction: string): ResolvedFunction | null => {
  const colonIndex = namespacedFunction.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const namespace = namespacedFunction.substring(0, colonIndex)
  const functionName = namespacedFunction.substring(colonIndex + 1)

  const packageName = aliasToPackage.get(namespace)
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
      coerceDataFromSchema?: boolean
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
        coerceDataFromSchema: this.options.coerceDataFromSchema,
        wire: updatedWire,
      }
    )
  }

  /**
   * Invoke a function from an external package
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

    // Get the loaded package
    const pkg = packageLoader.getLoadedPackage(resolved.package)
    if (!pkg) {
      throw new Error(
        `Package not loaded: ${resolved.package}. ` +
          `Make sure the package is loaded during initialization.`
      )
    }

    // Lazy-initialize package services if needed
    if (!pkg.singletons) {
      const parentServices = this.services as CoreSingletonServices
      await packageLoader.ensureServicesInitialized(
        resolved.package,
        parentServices
      )
    }

    // Execute the function using runPikkuFunc to get auth/middleware/permissions
    return runPikkuFunc<In, Out>('rpc', namespacedFunction, resolved.function, {
      auth: this.options.requiresAuth,
      singletonServices: pkg.singletons as any,
      createWireServices: pkg.registration.createWireServices as any,
      data: () => data,
      coerceDataFromSchema: this.options.coerceDataFromSchema,
      wire,
      packageName: resolved.package,
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
        coerceDataFromSchema: this.options.coerceDataFromSchema,
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
  private config?: RPCServiceConfig

  // Initialize the RPC service with configuration
  initialize(config: RPCServiceConfig) {
    this.config = config

    // Initialize namespace alias mapping with external packages
    if (config.externalPackages) {
      aliasToPackage = new Map(Object.entries(config.externalPackages))
    }
  }

  // Convenience function for initializing
  getContextRPCService(
    services: Services,
    wire: PikkuWire,
    requiresAuth?: boolean | undefined,
    depth: number = 0
  ): TypedRPC {
    const serviceRPC = new ContextAwareRPCService(services, wire, {
      coerceDataFromSchema: this.config?.coerceDataFromSchema,
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

// Convenience function for initializing
export const initialize = (config: RPCServiceConfig) => {
  rpcService.initialize(config)
}
