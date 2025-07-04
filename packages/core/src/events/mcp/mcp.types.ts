import { APIDocs, CoreUserSession } from '../../types/core.types.js'
import { CoreAPIFunctionSessionless } from '../../function/functions.types.js'

/**
 * Represents metadata for MCP endpoints (tools and resources), including name, description, and documentation.
 */
export type MCPEndpointsMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    {
      pikkuFuncName: string
      name: string
      description: string
      type: 'tool' | 'resource'
      streaming?: boolean
      session?: UserSession
      docs?: APIDocs
      tags?: string[]
    }
  >

/**
 * Represents a core MCP endpoint (tool or resource).
 */
export type CoreMCPEndpoint<
  APIFunction = CoreAPIFunctionSessionless<any, any>,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  name: string
  description: string
  type: 'tool' | 'resource'
  streaming?: boolean
  func: APIFunction
  docs?: APIDocs
  session?: UserSession
  tags?: string[]
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
