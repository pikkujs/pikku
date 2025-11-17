import {
  CoreServices,
  PikkuInteraction,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import { ForbiddenError } from '../../errors/errors.js'
import { PikkuRPC } from './rpc-types.js'

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
export class ContextAwareRPCService {
  constructor(
    private services: CoreServices,
    private interaction: PikkuInteraction,
    private options: {
      coerceDataFromSchema?: boolean
      requiresAuth?: boolean
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
    const rpcDepth = this.interaction.rpc?.depth || 0
    const updatedInteraction: PikkuInteraction = {
      ...this.interaction,
      rpc: this.interaction.rpc
        ? {
            ...this.interaction.rpc,
            depth: rpcDepth + 1,
            global: false,
          }
        : undefined,
    }
    return runPikkuFunc<In, Out>(
      PikkuWiringTypes.rpc,
      funcName,
      getPikkuFunctionName(funcName),
      {
        auth: this.options.requiresAuth,
        // TODO: this is a hack since services have already been created
        // but is valid since we don't want to keep creating new session services
        singletonServices: this.services,
        data: () => data,
        coerceDataFromSchema: this.options.coerceDataFromSchema,
        interaction: updatedInteraction,
      }
    )
  }

  public async rpcWithInteraction<In = any, Out = any>(
    funcName: string,
    data: In,
    interaction: PikkuInteraction
  ): Promise<Out> {
    const rpcDepth = this.interaction.rpc?.depth || 0
    const mergedInteraction: PikkuInteraction = {
      ...this.interaction,
      ...interaction,
      rpc: this.interaction.rpc
        ? {
            ...this.interaction.rpc,
            depth: rpcDepth + 1,
            global: false,
          }
        : undefined,
    }
    return runPikkuFunc<In, Out>(
      PikkuWiringTypes.rpc,
      funcName,
      getPikkuFunctionName(funcName),
      {
        auth: this.options.requiresAuth,
        singletonServices: this.services,
        data: () => data,
        coerceDataFromSchema: this.options.coerceDataFromSchema,
        interaction: mergedInteraction,
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
  }

  // Convenience function for initializing
  getContextRPCService(
    services: Services,
    interaction: PikkuInteraction,
    requiresAuth?: boolean | undefined,
    depth: number = 0
  ): TypedRPC {
    const serviceRPC = new ContextAwareRPCService(services, interaction, {
      coerceDataFromSchema: this.config?.coerceDataFromSchema,
      requiresAuth,
    })
    return {
      depth,
      global: false,
      invoke: serviceRPC.rpc.bind(serviceRPC),
      invokeExposed: serviceRPC.rpc.bind(serviceRPC),
      startWorkflow: serviceRPC.startWorkflow.bind(serviceRPC),
      rpcWithInteraction: serviceRPC.rpcWithInteraction.bind(serviceRPC),
    } as any
  }
}

// Create a singleton instance
export const rpcService = new PikkuRPCService()

// Convenience function for initializing
export const initialize = (config: RPCServiceConfig) => {
  rpcService.initialize(config)
}
