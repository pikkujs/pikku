/**
 *
 */
export const serializePikkuTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  sessionServicesTypeImport: string,
  rpcMapTypeImport: string
) => {
  return `/**
* This is used to provide the application types in the typescript project
*/
  
import { CorePikkuFunctionConfig, CorePikkuPermission, CorePikkuMiddleware, addHTTPMiddleware } from '@pikku/core'
import { CorePikkuFunction, CorePikkuFunctionSessionless } from '@pikku/core/function'
import { CoreHTTPFunctionWiring, AssertHTTPWiringParams, wireHTTP as wireHTTPCore } from '@pikku/core/http'
import { CoreScheduledTask, wireScheduler as wireSchedulerCore } from '@pikku/core/scheduler'
import { CoreChannel, PikkuChannel, wireChannel as wireChannelCore } from '@pikku/core/channel'
import { CoreQueueWorker, wireQueueWorker as wireQueueWorkerCore } from '@pikku/core/queue'
import { CoreMCPResource, CoreMCPTool, CoreMCPPrompt, wireMCPResource as wireMCPResourceCore, wireMCPTool as wireMCPToolCore, wireMCPPrompt as wireMCPPromptCore, MCPResourceResponse, MCPToolResponse, MCPPromptResponse, PikkuMCP } from '@pikku/core'

${userSessionTypeImport}
${singletonServicesTypeImport}
${sessionServicesTypeImport}
${rpcMapTypeImport}

/**
 * Type-safe API permission definition that integrates with your application's session type.
 * Use this to define authorization logic for your API endpoints.
 * 
 * @template In - The input type that the permission check will receive
 * @template RequiredServices - The services required for this permission check
 */
export type PikkuPermission<In = unknown, RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CorePikkuPermission<In, RequiredServices, ${userSessionTypeName}>

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple HTTP wirings.
 * 
 * @template RequiredServices - The services required for this middleware
 */
export type PikkuMiddleware<RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CorePikkuMiddleware<RequiredServices, ${userSessionTypeName}>

/**
 * A sessionless API function that doesn't require user authentication.
 * Use this for public endpoints, health checks, or operations that don't need user context.
 * 
 * @template In - The input type
 * @template Out - The output type that the function returns
 * @template ChannelData - Channel data type (null = optional channel)
 * @template MCPData - MCP data type (null = optional MCP)
 * @template RequiredServices - Services required by this function
 */
type PikkuFunctionSessionless<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Omit<Services, 'rpc'> &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  ) & ([MCPData] extends [null]
    ? { mcp?: PikkuMCP }  // Optional MCP
    : { mcp: PikkuMCP }  // Required MCP
  )
> = CorePikkuFunctionSessionless<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

/**
 * A session-aware API function that requires user authentication.
 * Use this for protected endpoints that need access to user session data.
 * 
 * @template In - The input type
 * @template Out - The output type that the function returns
 * @template ChannelData - Channel data type (null = optional channel)
 * @template MCPData - MCP data type (null = optional MCP)
 * @template RequiredServices - Services required by this function
 */
type PikkuFunction<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Omit<Services, 'rpc'> &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  ) & ([MCPData] extends [null]
    ? { mcp?: PikkuMCP }  // Optional MCP
    : { mcp: PikkuMCP }  // Required MCP
  )
> = CorePikkuFunction<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

/**
 * Type definition for HTTP API wirings with type-safe path parameters.
 * Supports both authenticated and unauthenticated functions.
 * 
 * @template In - Input type for the HTTP wiring
 * @template Out - Output type for the HTTP wiring
 * @template Route - String literal type for the HTTP path (e.g., "/users/:id")
 */
type HTTPWiring<In, Out, Route extends string> = CoreHTTPFunctionWiring<In, Out, Route, PikkuFunction<In, Out>, PikkuFunctionSessionless<In, Out>, PikkuPermission<In>, PikkuMiddleware>

/**
 * Type definition for WebSocket channels with typed data exchange.
 * Supports connection, disconnection, and message handling.
 * 
 * @template ChannelData - Type of data exchanged through the channel
 * @template Channel - String literal type for the channel name
 */
type ChannelWiring<ChannelData, Channel extends string> = CoreChannel<ChannelData, Channel, PikkuFunction<void, unknown> | PikkuFunction<void, unknown, ChannelData>, PikkuFunction<void, void> | PikkuFunction<void, void, ChannelData>, PikkuFunction<any, any> | PikkuFunction<any, any, ChannelData>, PikkuPermission>

/**
 * Type definition for scheduled tasks that run at specified intervals.
 * These are sessionless functions that execute based on cron expressions.
 */
type SchedulerWiring = CoreScheduledTask<PikkuFunctionSessionless<void, void>>

/**
 * Type definition for queue workers that process background jobs.
 * 
 * @template In - Input type for the queue job
 * @template Out - Output type for the queue job
 */
type QueueWiring<In, Out> = CoreQueueWorker<PikkuFunctionSessionless<In, Out>>

/**
 * Type definition for MCP resources that provide data to AI models.
 * 
 * @template In - Input type for the resource request
 */
type MCPResourceWiring<In> = CoreMCPResource<PikkuFunctionSessionless<In, MCPResourceResponse, null, true>>

/**
 * Type definition for MCP tools that AI models can invoke.
 * 
 * @template In - Input type for the tool invocation
 */
type MCPToolWiring<In> = CoreMCPTool<PikkuFunctionSessionless<In, MCPToolResponse, null, true>>

/**
 * Type definition for MCP prompts that provide templates to AI models.
 * 
 * @template In - Input type for the prompt parameters
 */
type MCPPromptWiring<In> = CoreMCPPrompt<PikkuFunctionSessionless<In, MCPPromptResponse, null, true>>

/**
 * Creates a Pikku function that can be either session-aware or sessionless.
 * This is the main function wrapper for creating API endpoints.
 * 
 * @template In - Input type for the function
 * @template Out - Output type for the function
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const createUser = pikkuFunc<{name: string, email: string}, {id: number, message: string}>({
 *   func: async ({db, logger}, input) => {
 *     logger.info('Creating user', input.name)
 *     const user = await db.users.create(input)
 *     return {id: user.id, message: \\\`User \\\${input.name} created successfully\\\`}
 *   },
 *   auth: true
 * })
 * \\\`\\\`\\\`
 */
export const pikkuFunc = <In, Out = unknown>(
  func:
    | PikkuFunction<In, Out>
    | CorePikkuFunctionConfig<PikkuFunction<In, Out>, PikkuPermission<In>>
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a sessionless Pikku function that doesn't require user authentication.
 * Use this for public endpoints, webhooks, or background tasks.
 * 
 * @template In - Input type for the function
 * @template Out - Output type for the function
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const healthCheck = pikkuSessionlessFunc<void, {status: string, timestamp: string}>({
 *   func: async ({logger}) => {
 *     logger.info('Health check requested')
 *     return {status: 'healthy', timestamp: new Date().toISOString()}
 *   },
 *   name: 'healthCheck'
 * })
 * \\\`\\\`\\\`
 */
export const pikkuSessionlessFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionSessionless<In, Out>
    | CorePikkuFunctionConfig<PikkuFunctionSessionless<In, Out>, PikkuPermission<In>, PikkuMiddleware>
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function that handles WebSocket channel connections.
 * Called when a client connects to a channel.
 * 
 * @template Out - Output type for connection response
 * @template ChannelData - Type of data associated with the channel
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const onChatConnect = pikkuChannelConnectionFunc<string>({
 *   func: async ({logger, channel, eventHub}) => {
 *     logger.info('User connected to chat')
 *     await eventHub.publish('chat:join', channel.channelId, {channelId: channel.channelId})
 *     return 'Welcome to the chat!'
 *   }
 * })
 * \\\`\\\`\\\`
 */
export const pikkuChannelConnectionFunc = <Out = unknown, ChannelData = unknown>(
  func:
    | PikkuFunctionSessionless<void, Out, ChannelData>
    | {
        func: PikkuFunctionSessionless<void, Out, ChannelData>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function that handles WebSocket channel disconnections.
 * Called when a client disconnects from a channel.
 * 
 * @template ChannelData - Type of data associated with the channel
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const onChatDisconnect = pikkuChannelDisconnectionFunc({
 *   func: async ({logger, channel, eventHub}) => {
 *     logger.info('User disconnected from chat')
 *     await eventHub.publish('chat:join', channel.channelId, {channelId: channel.channelId})
 *   }
 * })
 * \\\`\\\`\\\`
 */
export const pikkuChannelDisconnectionFunc = <ChannelData = unknown>(
  func:
    | PikkuFunctionSessionless<void, void, ChannelData>
    | {
        func: PikkuFunction<void, void, ChannelData>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function that handles WebSocket channel messages.
 * Called when a message is received on a channel.
 * 
 * @template In - Input type for channel messages
 * @template Out - Output type for channel responses
 * @template ChannelData - Type of data associated with the channel
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const handleChatMessage = pikkuChannelFunc<{message: string}, void>({
 *   func: async ({logger, channel}, input) => {
 *     logger.info('Chat message received:', input.message)
 *   }
 * })
 * \\\`\\\`\\\`
 */
export const pikkuChannelFunc = <In = unknown, Out = unknown, ChannelData = unknown>(
  func:
    | PikkuFunctionSessionless<In, Out, ChannelData>
    | CorePikkuFunctionConfig<PikkuFunction<In, Out, ChannelData>, PikkuPermission<In>>
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function that takes no input and returns no output.
 * Useful for health checks, triggers, or cleanup operations.
 * 
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \\\`\\\`\\\`typescript
 * const cleanupTempFiles = pikkuVoidFunc(async ({fileSystem, logger}) => {
 *     logger.info('Starting cleanup of temporary files')
 *     await fileSystem.deleteDirectory('/tmp/uploads')
 *     logger.info('Cleanup completed')
 * })
 * \\\`\\\`\\\`
 */
export const pikkuVoidFunc = (
  func:
    | PikkuFunctionSessionless<void, void>
    | CorePikkuFunctionConfig<PikkuFunction<void, void>, PikkuPermission<void>>
) => {
  return typeof func === 'function' ? func : func.func
}
   
/**
 * Registers a WebSocket channel with the Pikku framework.
 * 
 * @template ChannelData - Type of data associated with the channel
 * @template Channel - String literal type for the channel name
 * @param channel - Channel definition with connection, disconnection, and message handlers
 */
export const wireChannel = <ChannelData, Channel extends string>(
  channel: ChannelWiring<ChannelData, Channel> & AssertHTTPWiringParams<ChannelData, Channel>
) => {
  wireChannelCore(channel as any) // TODO
}

/**
 * Registers middleware either globally or for a specific route.
 * 
 * When a string route pattern is provided along with middleware, the middleware
 * is applied only to that route. Otherwise, if an array is provided, it is treated
 * as global middleware (applied to all routes).
 * 
 * @param routeOrMiddleware - Either a global middleware array or a route pattern string
 * @param middleware - The middleware array to apply when a route pattern is specified
 * 
 * @example
 * \`\`\`typescript
 * // Add global middleware
 * addHTTPMiddleware([authMiddleware, loggingMiddleware])
 * 
 * // Add route-specific middleware
 * addHTTPMiddleware('/api/admin/*', [adminAuthMiddleware])
 * \`\`\`
 */
export { addHTTPMiddleware }

/**
 * Registers an HTTP wiring with the Pikku framework.
 * 
 * @template In - Input type for the HTTP wiring
 * @template Out - Output type for the HTTP wiring
 * @template Route - String literal type for the HTTP path (e.g., "/users/:id")
 * @param httpWiring - HTTP wiring definition with handler, method, and optional middleware
 */
export const wireHTTP = <In, Out, Route extends string>(
  httpWiring: HTTPWiring<In, Out, Route> & AssertHTTPWiringParams<In, Route>
) => {
  wireHTTPCore(httpWiring)
}

/**
 * Registers a scheduled task with the Pikku framework.
 * Tasks run based on cron expressions and are sessionless.
 * 
 * @param task - Scheduled task definition with cron expression and handler
 */
export const wireScheduler = (task: SchedulerWiring) => {
  wireSchedulerCore(task as any) // TODO
}

/**
 * Registers a queue worker with the Pikku framework.
 * Workers process background jobs from queues.
 * 
 * @param queueWorker - Queue worker definition with job handler
 */
export const wireQueueWorker = (queueWorker: QueueWiring<any, any>) => {
  wireQueueWorkerCore(queueWorker as any) // TODO
}

/**
 * Registers an MCP resource with the Pikku framework.
 * Resources provide data that AI models can access.
 * 
 * @template In - Input type for the resource request
 * @param mcpResource - MCP resource definition with data provider function
 */
export const wireMCPResource = <In>(
  mcpResource: MCPResourceWiring<In>
) => {
  wireMCPResourceCore(mcpResource as any)
}

/**
 * Registers an MCP tool with the Pikku framework.
 * Tools are functions that AI models can invoke.
 * 
 * @template In - Input type for the tool invocation
 * @param mcpTool - MCP tool definition with action function
 */
export const wireMCPTool = <In>(
  mcpTool: MCPToolWiring<In>
) => {
  wireMCPToolCore(mcpTool as any)
}

/**
 * Registers an MCP prompt with the Pikku framework.
 * Prompts provide templates that AI models can use.
 * 
 * @template In - Input type for the prompt parameters
 * @param mcpPrompt - MCP prompt definition with template function
 */
export const wireMCPPrompt = <In>(
  mcpPrompt: MCPPromptWiring<In>
) => {
  wireMCPPromptCore(mcpPrompt as any)
}

/**
 * Creates a function for handling MCP prompt requests.
 * These functions generate prompt templates for AI models.
 * 
 * @template In - Input type for the prompt parameters
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \`\`\`typescript
 * const codeReviewPrompt = pikkuMCPPromptFunc<{language: string, code: string}>({
 *   func: async ({}, input) => ({
 *     messages: [{
 *       role: 'user',
 *       content: {
 *         type: 'text',
 *         text: \`Please review this \${input.language} code: \${input.code}\`
 *       }
 *     }]
 *   })
 * })
 * \`\`\`
 */
export const pikkuMCPPromptFunc = <In>(
  func:
    | PikkuFunctionSessionless<In, MCPPromptResponse>
    | {
        func: PikkuFunctionSessionless<In, MCPPromptResponse>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function for handling MCP tool invocations.
 * These functions perform actions that AI models can request.
 * 
 * @template In - Input type for the tool invocation
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \`\`\`typescript
 * const searchFiles = pikkuMCPToolFunc<{query: string, directory: string}>({
 *   func: async ({fileSystem}, input) => {
 *     const results = await fileSystem.search(input.query, input.directory)
 *     return [{
 *         type: 'text',
 *         text: \`Found \${results.length} files matching \"\${input.query}\"\`
 *       }]
 *   }
 * })
 * \`\`\`
 */
export const pikkuMCPToolFunc = <In>(
  func:
    | PikkuFunctionSessionless<In, MCPToolResponse, null, true>
    | {
      func: PikkuFunctionSessionless<In, MCPToolResponse, null, true>
      name?: string
    }
) => {
  return typeof func === 'function' ? func : func.func
}

/**
 * Creates a function for handling MCP resource requests.
 * These functions provide data that AI models can access.
 * 
 * @template In - Input type for the resource request
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 * 
 * @example
 * \`\`\`typescript
 * const getProjectFiles = pikkuMCPResourceFunc<{path: string}>({
 *   func: async ({ fileSystem }, input) => {
 *     const fileContent = await fileSystem.readFile(input.path)
 *     return [{
 *         uri: \`file://\${input.path}\`,
 *         mimeType: 'text/plain',
 *         text: fileContent
 *       }]
 *   }
 * })
 * \`\`\`
 */
export const pikkuMCPResourceFunc = <In>(
  func:
    | PikkuFunctionSessionless<In, MCPResourceResponse, null, true>
    | {
      func: PikkuFunctionSessionless<In, MCPResourceResponse, null, true>
      name?: string
    }
) => {
  return typeof func === 'function' ? func : func.func
}
`
}
