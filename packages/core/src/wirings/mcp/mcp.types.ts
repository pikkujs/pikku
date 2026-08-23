import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
} from '../../middleware/middleware.types.js'
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
  /** How the client addresses this resource. `{name}` marks a parameter, and every parameter must be a key of the function's input schema. */
  uri: string
  /** The name a human sees in a client's resource list. */
  title: string
  /** What the resource holds, written for the model deciding whether to read it. */
  description: string
  /** A one-line description for listings, where the full `description` is too long. */
  summary?: string
  /** Names of error classes this may throw, so the client is told which failures are its own fault. */
  errors?: string[]
  /** The media type of what the function returns, so the client knows whether it is text, JSON or an image. */
  mimeType?: string
  /** Size in bytes, where it is known ahead of the read. A client uses it to decide whether to fetch at all. */
  size?: number
  /** Whether the function returns the content in chunks rather than at once. */
  streaming?: boolean
  /** The function to run. It is sessionless: an MCP client is not a logged-in user. */
  func: PikkuFunctionConfig
  /** Filters this wiring in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Wraps every call: tracing, rate limiting, whatever the transport does not do. */
  middleware?: PikkuMiddleware[]
}

export type CoreMCPTool<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  /** How the model calls this tool. It is the tool's identity, so renaming it breaks any client that already knows it. */
  name: string
  /** The name a human sees, where the calling `name` is not readable. */
  title?: string
  /** What the tool does and when to reach for it. This is what the model decides on, so it earns more care than the rest of this object. */
  description?: string
  /** A one-line description for listings, where the full `description` is too long. */
  summary?: string
  /** Names of error classes this may throw, so the client is told which failures are its own fault. */
  errors?: string[]
  /** The function to run. It is sessionless: an MCP client is not a logged-in user. */
  func: PikkuFunctionConfig
  /** Filters this wiring in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Whether the function returns its result in chunks rather than at once. */
  streaming?: boolean
  /** Wraps every call: tracing, rate limiting, whatever the transport does not do. */
  middleware?: PikkuMiddleware[]
}

export type CoreMCPPrompt<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, MCPPromptResponse>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  /** How the client asks for this prompt. */
  name: string
  /** What the prompt is for, written for the human picking it out of a list. */
  description: string
  /** A one-line description for listings, where the full `description` is too long. */
  summary?: string
  /** Names of error classes this may throw, so the client is told which failures are its own fault. */
  errors?: string[]
  /** The function to run. It is sessionless: an MCP client is not a logged-in user. */
  func: PikkuFunctionConfig
  /** Filters this wiring in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Wraps every call: tracing, rate limiting, whatever the transport does not do. */
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
