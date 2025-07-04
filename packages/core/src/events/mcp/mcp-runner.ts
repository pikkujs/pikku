import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../../types/core.types.js'
import type {
  CoreMCPEndpoint,
  JsonRpcRequest,
  JsonRpcResponse,
} from './mcp.types.js'
import type { CoreAPIFunctionSessionless } from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { closeSessionServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { BadRequestError, NotFoundError } from '../../errors/errors.js'

export type RunMCPEndpointParams = {
  name: string
  data: any
  session?: CoreUserSession
  singletonServices: CoreSingletonServices
  createSessionServices?: CreateSessionServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

export type JsonRpcError = {
  code: number
  message: string
  data?: any
}

export const addMCPEndpoint = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpEndpoint: CoreMCPEndpoint<APIFunction>
) => {
  const meta = pikkuState('mcp', 'meta')
  const endpointMeta = meta[mcpEndpoint.name]
  if (!endpointMeta) {
    throw new Error(`MCP endpoint metadata not found for '${mcpEndpoint.name}'`)
  }
  addFunction(endpointMeta.pikkuFuncName, {
    func: mcpEndpoint.func,
  })

  const endpoints = pikkuState('mcp', 'endpoints')
  if (endpoints.has(mcpEndpoint.name)) {
    throw new Error(`MCP endpoint already exists: ${mcpEndpoint.name}`)
  }
  endpoints.set(mcpEndpoint.name, mcpEndpoint)
}

/**
 * JSON-RPC 2.0 compatible MCP endpoint runner
 */
export async function runMCPEndpointJsonRpc(
  request: JsonRpcRequest,
  {
    session,
    singletonServices,
    createSessionServices,
  }: Omit<RunMCPEndpointParams, 'name' | 'data'>
): Promise<JsonRpcResponse> {
  let sessionServices: any

  try {
    // Validate JSON-RPC request structure
    if (request.jsonrpc !== '2.0') {
      throw new BadRequestError(
        'Invalid JSON-RPC version, only supoorted version is 2.0'
      )
    }

    const endpointName = request.method
    const endpoint = pikkuState('mcp', 'endpoints').get(endpointName)
    const meta = pikkuState('mcp', 'meta')[endpointName]

    if (!endpoint || !meta) {
      throw new NotFoundError()
    }

    singletonServices.logger.info(
      `Running MCP ${endpoint.type}: ${endpointName}`
    )

    const getAllServices = async () => {
      if (createSessionServices) {
        const services = await createSessionServices(
          singletonServices,
          {},
          session
        )
        sessionServices = services
        return rpcService.injectRPCService({
          ...singletonServices,
          ...services,
        })
      }
      return singletonServices
    }

    const result = await runPikkuFunc(meta.pikkuFuncName, {
      getAllServices,
      session,
      data: request.params,
    })

    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    }
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)
    if (errorResponse != null) {
      singletonServices.logger.error(e)
    }

    let jsonRpcError: JsonRpcError
    if (errorResponse?.mcpCode) {
      jsonRpcError = {
        code: errorResponse.mcpCode,
        message: errorResponse.message,
      }
    } else {
      jsonRpcError = {
        code: -32603,
        message: 'Internal error',
        data: { message: e.message, stack: e.stack },
      }
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: jsonRpcError,
    }
  } finally {
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}

export const getMCPEndpoints = () => {
  return pikkuState('mcp', 'endpoints')
}

export const getMCPEndpointsMeta = () => {
  return pikkuState('mcp', 'meta')
}
