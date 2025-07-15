import { CoreAPIFunctionSessionless } from '../../function/functions.types.js'

export type PikkuMCP<Tools extends string = any> = {
  // elicitInput: <Input>(message: string) => Promise<{ action: string, content: Input }>
  uri?: string
  sendResourceUpdated: (uri: string) => void
  enableResources: (resources: Record<string, boolean>) => Promise<boolean>
  enablePrompts: (prompts: Record<string, boolean>) => Promise<boolean>
  enableTools: (tools: Record<Tools, boolean>) => Promise<boolean>
}

/**
 * Represents metadata for MCP resources, including name, description, and documentation.
 */
export type MCPResourceMeta = Record<
  string,
  Omit<CoreMCPResource, 'func'> & {
    pikkuFuncName: string
    inputSchema: string | null
    outputSchema: string | null
  }
>

/**
 * Represents metadata for MCP tools, including name, description, and documentation.
 */
export type MCPToolMeta = Record<
  string,
  Omit<CoreMCPTool, 'func'> & {
    pikkuFuncName: string
    inputSchema: string | null
    outputSchema: string | null
  }
>

/**
 * Represents metadata for MCP prompts, including name, description, and arguments.
 */
export type MCPPromptMeta = Record<
  string,
  Omit<CoreMCPPrompt, 'func'> & {
    pikkuFuncName: string
    inputSchema: string | null
    outputSchema: string | null
    arguments: Array<{
      name: string
      description: string
      required: boolean
    }>
  }
>

/**
 * Represents an MCP resource with specific properties.
 */
export type CoreMCPResource<
  APIFunction = CoreAPIFunctionSessionless<any, any>,
> = {
  uri: string
  title: string
  description?: string
  mimeType?: string
  size?: number
  streaming?: boolean
  func: APIFunction
  tags?: string[]
}

/**
 * Represents an MCP tool with specific properties.
 */
export type CoreMCPTool<APIFunction = CoreAPIFunctionSessionless<any, any>> = {
  name: string
  title?: string
  description: string
  annotations?: Record<string, any>
  func: APIFunction
  tags?: string[]
  streaming?: boolean
}

/**
 * Represents an MCP prompt with specific properties.
 */
export type CoreMCPPrompt<
  APIFunction = CoreAPIFunctionSessionless<any, MCPPromptResponse>,
> = {
  name: string
  description?: string
  func: APIFunction
  tags?: string[]
}

export type JsonRpcRequest = {
  jsonrpc: string
  id?: string | number | null
  params?: any
}

export type JsonRpcResponse = {
  id?: string | number | null
  result?: any
}

export type JsonRpcErrorResponse = {
  id?: string | number | null
  code: number
  message: string
  data?: any
}

/**
 * Represents a message in an MCP prompt response
 */
export type MCPPromptMessage = {
  role: 'user' | 'assistant' | 'system'
  content: {
    type: 'text' | 'image'
    text: string
    data?: string // for image content
  }
}

/**
 * Standard response type for MCP prompts - array of messages
 */
export type MCPPromptResponse = MCPPromptMessage[]

export type MCPResourceMessage = {
  uri: string
  text: string
}

export type MCPResourceResponse = MCPResourceMessage[]

/**
 * Standard response type for MCP prompts - array of messages
 */

export type MCPToolMessage =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image'
      data: string // base64 encoded image data
    }

export type MCPToolResponse = MCPToolMessage[]
