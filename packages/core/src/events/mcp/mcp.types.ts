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

// Legacy type aliases for backward compatibility
export type MCPResourcesMeta<UserSession extends CoreUserSession = any> =
  MCPEndpointsMeta<UserSession>
export type MCPToolsMeta<UserSession extends CoreUserSession = any> =
  MCPEndpointsMeta<UserSession>
export type CoreMCPResource<
  APIFunction = CoreAPIFunctionSessionless<any, any>,
  UserSession extends CoreUserSession = CoreUserSession,
> = CoreMCPEndpoint<APIFunction, UserSession>
export type CoreMCPTool<
  APIFunction = CoreAPIFunctionSessionless<any, any>,
  UserSession extends CoreUserSession = CoreUserSession,
> = CoreMCPEndpoint<APIFunction, UserSession>
