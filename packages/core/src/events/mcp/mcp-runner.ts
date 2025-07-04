import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../../types/core.types.js'
import type { CoreMCPEndpoint } from './mcp.types.js'
import type { CoreAPIFunctionSessionless } from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { closeSessionServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'

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

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string | number | null
  method: string
  params?: any
}

export type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export type JsonRpcError = {
  code: number
  message: string
  data?: any
}

// JSON-RPC 2.0 Error Codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  SERVER_ERROR: (code: number) => ({ code, message: 'Server error' }), // -32000 to -32099
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

// Legacy functions for backward compatibility
export const addMCPResource = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpResource: Omit<CoreMCPEndpoint<APIFunction>, 'type'> & {
    type?: 'resource'
  }
) => {
  addMCPEndpoint({ ...mcpResource, type: 'resource' })
}

export const addMCPTool = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpTool: Omit<CoreMCPEndpoint<APIFunction>, 'type'> & { type?: 'tool' }
) => {
  addMCPEndpoint({ ...mcpTool, type: 'tool' })
}

class MCPEndpointNotFoundError extends Error {
  constructor(name: string) {
    super(`MCP endpoint not found: ${name}`)
  }
}

export async function runMCPEndpoint({
  name,
  data,
  session,
  singletonServices,
  createSessionServices,
}: RunMCPEndpointParams): Promise<any> {
  let sessionServices: any
  try {
    const endpoint = pikkuState('mcp', 'endpoints').get(name)
    const meta = pikkuState('mcp', 'meta')[name]
    if (!endpoint) {
      throw new MCPEndpointNotFoundError(name)
    }
    if (!meta) {
      throw new MCPEndpointNotFoundError(`MCP endpoint meta not found: ${name}`)
    }

    singletonServices.logger.info(`Running MCP ${endpoint.type}: ${name}`)

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

    return await runPikkuFunc(meta.pikkuFuncName, {
      getAllServices,
      session,
      data,
    })
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)
    if (errorResponse != null) {
      singletonServices.logger.error(e)
    }
    throw e
  } finally {
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
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
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: JSON_RPC_ERRORS.INVALID_REQUEST,
      }
    }

    const endpointName = request.method
    const endpoint = pikkuState('mcp', 'endpoints').get(endpointName)
    const meta = pikkuState('mcp', 'meta')[endpointName]

    if (!endpoint || !meta) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
      }
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

    // Map error to JSON-RPC error
    let jsonRpcError: JsonRpcError
    if (e instanceof MCPEndpointNotFoundError) {
      jsonRpcError = JSON_RPC_ERRORS.METHOD_NOT_FOUND
    } else if (e.name === 'ValidationError' || e.name === 'TypeError') {
      jsonRpcError = JSON_RPC_ERRORS.INVALID_PARAMS
    } else {
      jsonRpcError = {
        ...JSON_RPC_ERRORS.INTERNAL_ERROR,
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

/**
 * Handle batch JSON-RPC requests (array of requests)
 */
export async function runMCPEndpointJsonRpcBatch(
  requests: JsonRpcRequest[],
  params: Omit<RunMCPEndpointParams, 'name' | 'data'>
): Promise<JsonRpcResponse[]> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [
      {
        jsonrpc: '2.0',
        id: null,
        error: JSON_RPC_ERRORS.INVALID_REQUEST,
      },
    ]
  }

  // Process all requests in parallel
  const responses = await Promise.all(
    requests.map((request) => runMCPEndpointJsonRpc(request, params))
  )

  // Filter out notification responses (requests with id = null)
  return responses.filter((response) => response.id !== null)
}

/**
 * Parse and handle JSON-RPC request (single or batch)
 */
export async function handleMCPJsonRpcRequest(
  requestData: string | JsonRpcRequest | JsonRpcRequest[],
  params: Omit<RunMCPEndpointParams, 'name' | 'data'>
): Promise<JsonRpcResponse | JsonRpcResponse[]> {
  try {
    let parsedRequest: JsonRpcRequest | JsonRpcRequest[]

    if (typeof requestData === 'string') {
      try {
        parsedRequest = JSON.parse(requestData)
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id: null,
          error: JSON_RPC_ERRORS.PARSE_ERROR,
        }
      }
    } else {
      parsedRequest = requestData
    }

    if (Array.isArray(parsedRequest)) {
      return await runMCPEndpointJsonRpcBatch(parsedRequest, params)
    } else {
      return await runMCPEndpointJsonRpc(parsedRequest, params)
    }
  } catch (e: any) {
    return {
      jsonrpc: '2.0',
      id: null,
      error: {
        ...JSON_RPC_ERRORS.INTERNAL_ERROR,
        data: { message: e.message },
      },
    }
  }
}

export const getMCPEndpoints = () => {
  return pikkuState('mcp', 'endpoints')
}

export const getMCPEndpointsMeta = () => {
  return pikkuState('mcp', 'meta')
}

// Legacy functions for backward compatibility
export const getMCPResources = () => {
  return new Map(
    [...getMCPEndpoints()].filter(
      ([_, endpoint]) => endpoint.type === 'resource'
    )
  )
}

export const getMCPTools = () => {
  return new Map(
    [...getMCPEndpoints()].filter(([_, endpoint]) => endpoint.type === 'tool')
  )
}

export const getMCPResourcesMeta = () => {
  const meta = getMCPEndpointsMeta()
  return Object.fromEntries(
    Object.entries(meta).filter(
      ([_, endpointMeta]) => endpointMeta.type === 'resource'
    )
  )
}

export const getMCPToolsMeta = () => {
  const meta = getMCPEndpointsMeta()
  return Object.fromEntries(
    Object.entries(meta).filter(
      ([_, endpointMeta]) => endpointMeta.type === 'tool'
    )
  )
}
