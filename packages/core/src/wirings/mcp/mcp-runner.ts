import type { PikkuWire } from '../../types/core.types.js'
import type {
  CoreMCPResource,
  CoreMCPPrompt,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  PikkuMCP,
} from './mcp.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { closeWireServices } from '../../utils.js'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import {
  BadRequestError,
  NotFoundError,
  PikkuMissingMetaError,
} from '../../errors/errors.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'

export class MCPError extends Error {
  constructor(public readonly error: JsonRpcErrorResponse) {
    super(error?.message || 'MCP Error')
    this.name = 'MCPError'
    this.stack = new Error().stack
  }
}

export type RunMCPEndpointParams<Tools extends string = any> = {
  mcp?: PikkuMCP<Tools>
}

export type JsonRpcError = {
  code: number
  message: string
  data?: any
}

export const wireMCPResource = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  > = CorePikkuFunctionConfig<CorePikkuFunctionSessionless<any, any>>,
>(
  mcpResource: CoreMCPResource<PikkuFunctionConfig>
) => {
  const resourcesMeta = pikkuState(null, 'mcp', 'resourcesMeta')
  const mcpResourceMeta = resourcesMeta[mcpResource.uri]
  if (!mcpResourceMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for MCP resource '${mcpResource.uri}'`
    )
  }
  addFunction(mcpResourceMeta.pikkuFuncId, mcpResource.func as any)
  const resources = pikkuState(null, 'mcp', 'resources')
  if (resources.has(mcpResource.uri)) {
    throw new Error(`MCP resource already exists: ${mcpResource.uri}`)
  }
  resources.set(mcpResource.uri, mcpResource)
}

export const wireMCPPrompt = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  > = CorePikkuFunctionConfig<CorePikkuFunctionSessionless<any, any>>,
>(
  mcpPrompt: CoreMCPPrompt<PikkuFunctionConfig>
) => {
  const promptsMeta = pikkuState(null, 'mcp', 'promptsMeta')
  const mcpPromptMeta = promptsMeta[mcpPrompt.name]
  if (!mcpPromptMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for MCP prompt '${mcpPrompt.name}'`
    )
  }
  addFunction(mcpPromptMeta.pikkuFuncId, mcpPrompt.func as any)
  const prompts = pikkuState(null, 'mcp', 'prompts')
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
  let pikkuFuncId: string | undefined
  let extractedParams: Record<string, string> = {}

  const metas = pikkuState(null, 'mcp', 'resourcesMeta')
  const endpoints = pikkuState(null, 'mcp', 'resources')

  if (endpoints.has(uri)) {
    endpoint = endpoints.get(uri)
    pikkuFuncId = metas[uri]?.pikkuFuncId
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
        pikkuFuncId = metas[uriTemplate]?.pikkuFuncId

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
    pikkuFuncId,
    { ...params, mcp: { ...params.mcp, uri } } as RunMCPEndpointParams<
      keyof CoreMCPResource
    >
  )
}

export async function runMCPTool(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const meta = pikkuState(null, 'mcp', 'toolsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'tool',
    name,
    undefined,
    meta?.pikkuFuncId,
    params
  )
}

export async function runMCPPrompt(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const endpoint = pikkuState(null, 'mcp', 'prompts').get(name)
  const meta = pikkuState(null, 'mcp', 'promptsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'prompt',
    name,
    endpoint,
    meta?.pikkuFuncId,
    params
  )
}

/**
 * JSON-RPC 2.0 compatible MCP endpoint runner
 */
async function runMCPPikkuFunc(
  request: JsonRpcRequest,
  type: 'resource' | 'tool' | 'prompt',
  name: string,
  mcp: CoreMCPResource | CoreMCPPrompt | undefined,
  pikkuFuncId: string | undefined,
  { mcp: mcpWire }: RunMCPEndpointParams
): Promise<JsonRpcResponse> {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  let wireServices: any

  try {
    if (request.jsonrpc !== '2.0') {
      throw new BadRequestError(
        'Invalid JSON-RPC version, only supoorted version is 2.0'
      )
    }

    if (mcp === undefined && type !== 'tool') {
      throw new NotFoundError(
        `MCP '${type}' registration not found for '${name}'`
      )
    }

    if (!pikkuFuncId) {
      throw new NotFoundError(
        `MCP '${type}' PikkuFunction Mapping not found for '${name}'`
      )
    }

    singletonServices.logger.debug(`Running MCP ${type}: ${name}`)

    const mcpSessionService = new PikkuSessionService()
    const wire: PikkuWire = {
      mcp: mcpWire,
      ...createMiddlewareSessionWireProps(mcpSessionService),
    }

    let meta: any
    if (type === 'resource') {
      meta = pikkuState(null, 'mcp', 'resourcesMeta')[name]
    } else if (type === 'tool') {
      meta = pikkuState(null, 'mcp', 'toolsMeta')[name]
    } else if (type === 'prompt') {
      meta = pikkuState(null, 'mcp', 'promptsMeta')[name]
    }

    let result = await runPikkuFunc('mcp', `${type}:${name}`, pikkuFuncId, {
      singletonServices,
      createWireServices,
      data: () => request.params,
      inheritedMiddleware: meta?.middleware,
      wireMiddleware: mcp?.middleware,
      inheritedPermissions: meta?.permissions,
      wirePermissions: mcp?.permissions,
      tags: mcp?.tags,
      wire,
      sessionService: mcpSessionService,
    })

    if (type === 'tool' && meta?.outputSchema !== 'MCPToolResponse') {
      result = [{ type: 'text', text: JSON.stringify(result) }]
    }

    return {
      id: request.id,
      result,
    }
  } catch (e: any) {
    singletonServices.logger.error(
      `Error running MCP ${type} '${name}':`,
      e.constructor
    )
    const errorResponse = getErrorResponse(e)
    if (errorResponse?.mcpCode) {
      throw new MCPError({
        id: request.id,
        code: errorResponse.mcpCode,
        message: errorResponse.message,
      })
    } else {
      if (errorResponse) {
        singletonServices.logger.warn(
          `Got error without a mapping: ${errorResponse.message}`
        )
      }
      throw new MCPError({
        id: request.id,
        code: -32603,
        message: 'Internal error',
        data: { message: e.message, stack: e.stack },
      })
    }
  } finally {
    if (wireServices) {
      await closeWireServices(singletonServices.logger, wireServices)
    }
  }
}

export const getMCPResources = () => {
  return pikkuState(null, 'mcp', 'resources')
}

export const getMCPResourcesMeta = () => {
  return pikkuState(null, 'mcp', 'resourcesMeta')
}

export const getMCPToolsMeta = () => {
  return pikkuState(null, 'mcp', 'toolsMeta')
}

export const getMCPPrompts = () => {
  return pikkuState(null, 'mcp', 'prompts')
}

export const getMCPPromptsMeta = () => {
  return pikkuState(null, 'mcp', 'promptsMeta')
}
