import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
} from '../../types/core.types.js'

/** "user/{userId}/post/{postId}" => "userId" | "postId" */
type ExtractMCPURIParams<S extends string> =
  S extends `${string}{${infer Param}}/${infer Rest}`
    ? Param | ExtractMCPURIParams<Rest>
    : S extends `${string}{${infer Param}}`
      ? Param
      : never

/** Resolves to a tuple of error strings, not `never`, so the mismatch surfaces in the type error. */
export type AssertMCPResourceURIParams<In, URI extends string> =
  ExtractMCPURIParams<URI> extends keyof In
    ? unknown
    : [
        'Error: MCP Resource URI parameters',
        ExtractMCPURIParams<URI>,
        'not in input type',
        keyof In,
      ]

export type PikkuMCP<Tools extends string = any> = {
  uri?: string
  sendResourceUpdated: (uri: string) => void
  enableResources: (resources: Record<string, boolean>) => Promise<boolean>
  enablePrompts: (prompts: Record<string, boolean>) => Promise<boolean>
  enableTools: (tools: Record<Tools, boolean>) => Promise<boolean>
}

export type MCPResourceMeta = Record<
  string,
  Omit<CoreMCPResource, 'func' | 'middleware'> & {
    pikkuFuncId: string
    inputSchema: string | null
    outputSchema: string | null
    middleware?: MiddlewareMetadata[] // tag + explicit, already merged
  }
>

export type MCPToolMeta = Record<
  string,
  Omit<CoreMCPTool, 'func' | 'middleware'> & {
    pikkuFuncId: string
    inputSchema: string | null
    outputSchema: string | null
    middleware?: MiddlewareMetadata[] // tag + explicit, already merged
  }
>

export type MCPPromptMeta = Record<
  string,
  Omit<CoreMCPPrompt, 'func' | 'middleware'> & {
    pikkuFuncId: string
    inputSchema: string | null
    outputSchema: string | null
    arguments: Array<{
      name: string
      description: string
      required: boolean
    }>
    middleware?: MiddlewareMetadata[] // tag + explicit, already merged
  }
>

export type CoreMCPResource<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  uri: string
  title: string
  description: string
  summary?: string
  errors?: string[]
  mimeType?: string
  size?: number
  streaming?: boolean
  func: PikkuFunctionConfig
  tags?: string[]
  middleware?: PikkuMiddleware[]
}

export type CoreMCPTool<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  title?: string
  description?: string
  summary?: string
  errors?: string[]
  func: PikkuFunctionConfig
  tags?: string[]
  streaming?: boolean
  middleware?: PikkuMiddleware[]
}

export type CoreMCPPrompt<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, MCPPromptResponse>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  description: string
  summary?: string
  errors?: string[]
  func: PikkuFunctionConfig
  tags?: string[]
  middleware?: PikkuMiddleware[]
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

export type MCPPromptMessage = {
  role: 'user' | 'assistant' | 'system'
  content: {
    type: 'text' | 'image'
    text: string
    data?: string
  }
}

export type MCPPromptResponse = MCPPromptMessage[]

export type MCPResourceMessage = {
  uri: string
  text: string
}

export type MCPResourceResponse = MCPResourceMessage[]

export type MCPToolMessage =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'image'
      data: string // base64
    }

export type MCPToolResponse = MCPToolMessage[]
