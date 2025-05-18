import {
  CoreSingletonServices,
  CoreServices,
  CreateSessionServices,
  CoreUserSession,
} from '../types/core.types.js'
import { runPikkuFunc } from '../function/function-runner.js'
import { pikkuState } from '../pikku-state.js'
import { RPCMeta } from './rpc-types.js'
import { PikkuUserSessionService } from '../services/user-session-service.js'

// Type for the RPC service configuration
type RPCServiceConfig = {
  singletonServices: CoreSingletonServices
  createSessionServices: CreateSessionServices
  coerceDataFromSchema: boolean
}

const getRPCMeta = (rpcName: string): RPCMeta => {
  const rpc = pikkuState('rpc', 'meta')
  const rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    throw new Error(`RPC function not found: ${rpcName}`)
  }
  return rpcMeta
}

// Context-aware RPC client for use within services
class ServiceRPC {
  constructor(
    private services: CoreServices,
    private options: {
      coerceDataFromSchema?: boolean
    }
  ) {}

  public async rpc<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    const session = await this.services.userSession?.get()
    const rpcDepth = this.services.rpc?.depth || 0
    const rpcMeta = getRPCMeta(funcName)
    return runPikkuFunc<In, Out>(rpcMeta.pikkuFuncName, {
      getAllServices: () => {
        this.services.rpc = this.services.rpc
          ? {
              ...this.services.rpc,
              depth: rpcDepth + 1,
              global: false,
            }
          : undefined
        return this.services
      },
      data,
      session,
      coerceDataFromSchema: this.options.coerceDataFromSchema,
    })
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
    const serviceRPC = new ServiceRPC(serviceCopy, {
      coerceDataFromSchema: this.config?.coerceDataFromSchema,
    })
    serviceCopy.rpc = {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
    }
    return serviceCopy
  }

  //   Global RPC method to call functions by name
  async rpc<In = any, Out = any>(
    funcName: string,
    data: In,
    session?: CoreUserSession
  ): Promise<Out> {
    if (!this.config) {
      throw new Error('RPC service not initialized')
    }

    const rpcMeta = getRPCMeta(funcName)
    const { singletonServices, createSessionServices, coerceDataFromSchema } =
      this.config

    // Define the getAllServices function for runPikkuFunc
    const getAllServices = async () => {
      const userSession = new PikkuUserSessionService()
      if (session) {
        userSession.set(session)
      }

      const sessionServices = await createSessionServices(
        singletonServices,
        {},
        session
      )

      return this.injectRPCService(
        {
          ...singletonServices,
          ...sessionServices,
          userSession,
        },
        0
      )
    }

    // Call the function using runPikkuFunc - it will handle permission merging
    return runPikkuFunc<In, Out>(rpcMeta.pikkuFuncName, {
      getAllServices,
      data,
      session,
      coerceDataFromSchema: coerceDataFromSchema ?? true,
    })
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()

// Convenience function for initializing
export const initialize = (config: RPCServiceConfig) => {
  rpcService.initialize(config)
}

// Convenience function for making standalone RPC calls
export const pikkuRPC = <In = any, Out = any, session = CoreUserSession>(
  funcName: string,
  data: In,
  session?: CoreUserSession
): Promise<Out> => {
  return rpcService.rpc(funcName, data, session)
}
