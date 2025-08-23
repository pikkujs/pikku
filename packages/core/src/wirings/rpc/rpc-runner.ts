import { CoreServices, PikkuWiringTypes } from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ForbiddenError } from '../../errors/errors.js'

// Type for the RPC service configuration
type RPCServiceConfig = {
  coerceDataFromSchema: boolean
}

const getPikkuFunctionName = (rpcName: string): string => {
  const rpc = pikkuState('rpc', 'meta')
  const rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    throw new Error(`RPC function not found: ${rpcName}`)
  }
  return rpcMeta
}

// Context-aware RPC client for use within services
class ContextAwareRPCService {
  constructor(
    private services: CoreServices,
    private options: {
      coerceDataFromSchema?: boolean
    }
  ) {}

  public async rpcExposed(funcName: string, data: any): Promise<any> {
    const functionMeta = pikkuState('function', 'meta')[funcName]
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
    const session = await this.services.userSession?.get()
    const rpcDepth = this.services.rpc?.depth || 0
    const pikkuFuncName = getPikkuFunctionName(funcName)
    return runPikkuFunc<In, Out>(
      PikkuWiringTypes.rpc,
      pikkuFuncName,
      pikkuFuncName,
      {
        getAllServices: () => {
          this.services.rpc = this.services.rpc
            ? ({
                ...this.services.rpc,
                depth: rpcDepth + 1,
                global: false,
              } as any)
            : undefined
          return this.services
        },
        data,
        session,
        coerceDataFromSchema: this.options.coerceDataFromSchema,
      }
    )
  }
}

// RPC Service class for the global interface
export class PikkuRPCService {
  private config?: RPCServiceConfig

  // Initialize the RPC service with configuration
  initialize(config: RPCServiceConfig) {
    this.config = config
  }

  // Convenience function for initializing
  injectRPCService(coreServices: CoreServices, depth: number = 0) {
    const serviceCopy = {
      ...coreServices,
    }
    const serviceRPC = new ContextAwareRPCService(serviceCopy, {
      coerceDataFromSchema: this.config?.coerceDataFromSchema,
    })
    serviceCopy.rpc = {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
      invokeExposed: serviceRPC.rpc.bind(serviceRPC),
    } as any
    return serviceCopy
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()

// Convenience function for initializing
export const initialize = (config: RPCServiceConfig) => {
  rpcService.initialize(config)
}
