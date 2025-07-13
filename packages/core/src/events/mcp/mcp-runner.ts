import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../../types/core.types.js'
import type {
  CoreMCPResource,
  CoreMCPTool,
  CoreMCPPrompt,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
} from './mcp.types.js'
import type { CoreAPIFunctionSessionless } from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { closeSessionServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { BadRequestError, NotFoundError } from '../../errors/errors.js'

export class MCPError extends Error {
  constructor(public readonly error: JsonRpcErrorResponse) {
    super(error?.message || 'MCP Error')
    this.name = 'MCPError'
    this.stack = new Error().stack
  }
}

export type RunMCPEndpointParams = {
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

export const addMCPResource = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpResource: CoreMCPResource<APIFunction>
) => {
  const resourcesMeta = pikkuState('mcp', 'resourcesMeta')
  const mcpResourceMeta = resourcesMeta[mcpResource.uri]
  if (!mcpResourceMeta) {
    throw new Error(`MCP resource metadata not found for '${mcpResource.uri}'`)
  }
  addFunction(mcpResourceMeta.pikkuFuncName, {
    func: mcpResource.func,
  })
  const resources = pikkuState('mcp', 'resources')
  if (resources.has(mcpResource.uri)) {
    throw new Error(`MCP resource already exists: ${mcpResource.uri}`)
  }
  resources.set(mcpResource.uri, mcpResource)
}

export const addMCPTool = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpTool: CoreMCPTool<APIFunction>
) => {
  const toolsMeta = pikkuState('mcp', 'toolsMeta')
  const mcpToolMeta = toolsMeta[mcpTool.name]
  if (!mcpToolMeta) {
    throw new Error(`MCP tool metadata not found for '${mcpTool.name}'`)
  }
  addFunction(mcpToolMeta.pikkuFuncName, {
    func: mcpTool.func,
  })
  const tools = pikkuState('mcp', 'tools')
  if (tools.has(mcpTool.name)) {
    throw new Error(`MCP tool already exists: ${mcpTool.name}`)
  }
  tools.set(mcpTool.name, mcpTool)
}

export const addMCPPrompt = <
  APIFunction extends CoreAPIFunctionSessionless<any, any>,
>(
  mcpPrompt: CoreMCPPrompt<APIFunction>
) => {
  const promptsMeta = pikkuState('mcp', 'promptsMeta')
  const mcpPromptMeta = promptsMeta[mcpPrompt.name]
  if (!mcpPromptMeta) {
    throw new Error(`MCP prompt metadata not found for '${mcpPrompt.name}'`)
  }
  addFunction(mcpPromptMeta.pikkuFuncName, {
    func: mcpPrompt.func,
  })
  const prompts = pikkuState('mcp', 'prompts')
  if (prompts.has(mcpPrompt.name)) {
    throw new Error(`MCP prompt already exists: ${mcpPrompt.name}`)
  }
  prompts.set(mcpPrompt.name, mcpPrompt)
}

export async function runMCPResource(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  uri: string
) {
  let endpoint: CoreMCPResource | undefined
  let pikkuFuncName: string | undefined
  let extractedParams: Record<string, string> = {}

  const metas = pikkuState('mcp', 'resourcesMeta')
  const endpoints = pikkuState('mcp', 'resources')

  if (endpoints.has(uri)) {
    endpoint = endpoints.get(uri)
    pikkuFuncName = metas[uri]?.pikkuFuncName
  } else {
    for (const [uriTemplate, value] of endpoints.entries()) {
      // Extract parameter names from the template
      const paramNames = Array.from(
        uriTemplate.matchAll(/\{([^}]+)\}/g),
        (m) => m[1]
      )

      // Create regex pattern to match and capture parameter values
      const regexPattern = uriTemplate.replace(/\{[^}]+\}/g, '([^/]+)')
      const regex = new RegExp(`^${regexPattern}$`)
      const match = uri.match(regex)

      if (match) {
        endpoint = value
        pikkuFuncName = metas[uriTemplate]?.pikkuFuncName

        // Extract parameter values and create params object
        for (let i = 0; i < paramNames.length; i++) {
          extractedParams[paramNames[i]!] = match[i + 1]! // match[0] is the full match
        }
        break
      }
    }
  }

  return await runMCPPikkuFunc(
    {
      ...request,
      params: { ...request.params, ...extractedParams },
    },
    'resource',
    uri,
    endpoint,
    pikkuFuncName,
    params
  )
}

export async function runMCPTool(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const endpoint = pikkuState('mcp', 'tools').get(name)
  const meta = pikkuState('mcp', 'toolsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'tool',
    name,
    endpoint,
    meta?.pikkuFuncName,
    params
  )
}

export async function runMCPPrompt(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const endpoint = pikkuState('mcp', 'prompts').get(name)
  const meta = pikkuState('mcp', 'promptsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'prompt',
    name,
    endpoint,
    meta?.pikkuFuncName,
    params
  )
}

/**
 * JSON-RPC 2.0 compatible MCP endpoint runner
 */
async function runMCPPikkuFunc(
  request: JsonRpcRequest,
  type: 'resource' | 'tool' | 'prompt',
  id: string,
  mcp: CoreMCPResource | CoreMCPTool | CoreMCPPrompt | undefined,
  pikkuFuncName: string | undefined,
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

    if (!mcp) {
      throw new NotFoundError(
        `MCP '${type}' registration not found for '${id}'`
      )
    }

    if (!pikkuFuncName) {
      throw new NotFoundError(
        `MCP '${type}' PikkuFunction Mapping not found for '${id}'`
      )
    }

    singletonServices.logger.info(`Running MCP ${type}: ${id}`)

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

    const result = await runPikkuFunc(pikkuFuncName, {
      getAllServices,
      session,
      data: request.params,
    })

    return {
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

    throw new MCPError({
      id: request.id,
      ...jsonRpcError,
    })
  } finally {
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}

export const getMCPTools = () => {
  return pikkuState('mcp', 'tools')
}

export const getMCPResources = () => {
  return pikkuState('mcp', 'resources')
}

export const getMCPResourcesMeta = () => {
  return pikkuState('mcp', 'resourcesMeta')
}

export const getMCPToolsMeta = () => {
  return pikkuState('mcp', 'toolsMeta')
}

export const getMCPPrompts = () => {
  return pikkuState('mcp', 'prompts')
}

export const getMCPPromptsMeta = () => {
  return pikkuState('mcp', 'promptsMeta')
}
