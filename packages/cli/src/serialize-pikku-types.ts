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
  
import { CoreAPIPermission, PikkuMiddleware } from '@pikku/core'
import { CoreAPIFunction, CoreAPIFunctionSessionless } from '@pikku/core/function'
import { CoreHTTPFunctionRoute, AssertRouteParams, addHTTPRoute as addCoreHTTPRoute } from '@pikku/core/http'
import { CoreScheduledTask, addScheduledTask as addCoreScheduledTask } from '@pikku/core/scheduler'
import { CoreAPIChannel, PikkuChannel, addChannel as addCoreChannel } from '@pikku/core/channel'
import { CoreQueueWorker, addQueueWorker as addCoreQueueWorker } from '@pikku/core/queue'
import { CoreMCPResource, CoreMCPTool, CoreMCPPrompt, addMCPResource as addCoreMCPResource, addMCPTool as addCoreMCPTool, addMCPPrompt as addCoreMCPPrompt, MCPResourceResponse, MCPToolResponse, MCPPromptResponse, PikkuMCP } from '@pikku/core'

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
export type APIPermission<In = unknown, RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CoreAPIPermission<In, RequiredServices, ${userSessionTypeName}>

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple routes.
 * 
 * @template RequiredServices - The services required for this middleware
 */
export type APIMiddleware<RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = PikkuMiddleware<RequiredServices, ${userSessionTypeName}>

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
type APIFunctionSessionless<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Services &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  ) & ([MCPData] extends [null]
    ? { mcp?: PikkuMCP }  // Optional MCP
    : { mcp: PikkuMCP }  // Required MCP
  )
> = CoreAPIFunctionSessionless<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

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
type APIFunction<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Services &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  ) & ([MCPData] extends [null]
    ? { mcp?: PikkuMCP }  // Optional MCP
    : { mcp: PikkuMCP }  // Required MCP
  )
> = CoreAPIFunction<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

/**
 * Type definition for HTTP API routes with type-safe path parameters.
 * Supports both authenticated and unauthenticated functions.
 * 
 * @template In - Input type for the route
 * @template Out - Output type for the route
 * @template Route - String literal type for the route path (e.g., "/users/:id")
 */
type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<In, Out, Route, APIFunction<In, Out>, APIFunctionSessionless<In, Out>, APIPermission<In>, APIMiddleware>

/**
 * Type definition for WebSocket channels with typed data exchange.
 * Supports connection, disconnection, and message handling.
 * 
 * @template ChannelData - Type of data exchanged through the channel
 * @template Channel - String literal type for the channel name
 */
type APIChannel<ChannelData, Channel extends string> = CoreAPIChannel<ChannelData, Channel, APIFunction<void, unknown> | APIFunction<void, unknown, ChannelData>, APIFunction<void, void> | APIFunction<void, void, ChannelData>, APIFunction<any, any> | APIFunction<any, any, ChannelData>, APIPermission>

/**
 * Type definition for scheduled tasks that run at specified intervals.
 * These are sessionless functions that execute based on cron expressions.
 */
type ScheduledTask = CoreScheduledTask<APIFunctionSessionless<void, void>, ${userSessionTypeName}>

/**
 * Type definition for queue workers that process background jobs.
 * 
 * @template In - Input type for the queue job
 * @template Out - Output type for the queue job
 */
type QueueWorker<In, Out> = CoreQueueWorker<APIFunctionSessionless<In, Out>>

/**
 * Type definition for MCP resources that provide data to AI models.
 * 
 * @template In - Input type for the resource request
 */
type MCPResource<In> = CoreMCPResource<APIFunctionSessionless<In, MCPResourceResponse, null, true>>

/**
 * Type definition for MCP tools that AI models can invoke.
 * 
 * @template In - Input type for the tool invocation
 */
type MCPTool<In> = CoreMCPTool<APIFunctionSessionless<In, MCPToolResponse, null, true>>

/**
 * Type definition for MCP prompts that provide templates to AI models.
 * 
 * @template In - Input type for the prompt parameters
 */
type MCPPrompt<In> = CoreMCPPrompt<APIFunctionSessionless<In, MCPPromptResponse, null, true>>

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
    | APIFunction<In, Out>
    | {
        func: APIFunction<In, Out>
        auth?: true
        name?: string
      }
    | {
        func: APIFunctionSessionless<In, Out>
        auth: false
        name?: string
      }
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
    | APIFunctionSessionless<In, Out>
    | {
        func: APIFunctionSessionless<In, Out>
        name?: string
      }
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
    | APIFunctionSessionless<void, Out, ChannelData>
    | {
        func: APIFunctionSessionless<void, Out, ChannelData>
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
    | APIFunctionSessionless<void, void, ChannelData>
    | {
        func: APIFunction<void, void, ChannelData>
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
    | APIFunctionSessionless<In, Out, ChannelData>
    | {
        func: APIFunctionSessionless<In, Out, ChannelData>
        name?: string
      }
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
    | APIFunctionSessionless<void, void>
    | {
        func: APIFunctionSessionless<void, void>
        name?: string
      }
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
export const addChannel = <ChannelData, Channel extends string>(
  channel: APIChannel<ChannelData, Channel> & AssertRouteParams<ChannelData, Channel>
) => {
  addCoreChannel(channel as any) // TODO
}

/**
 * Registers an HTTP route with the Pikku framework.
 * 
 * @template In - Input type for the route
 * @template Out - Output type for the route
 * @template Route - String literal type for the route path (e.g., "/users/:id")
 * @param route - Route definition with handler, method, and optional middleware
 */
export const addHTTPRoute = <In, Out, Route extends string>(
  route: APIRoute<In, Out, Route> & AssertRouteParams<In, Route>
) => {
  addCoreHTTPRoute(route)
}

/**
 * Registers a scheduled task with the Pikku framework.
 * Tasks run based on cron expressions and are sessionless.
 * 
 * @param task - Scheduled task definition with cron expression and handler
 */
export const addScheduledTask = (task: ScheduledTask) => {
  addCoreScheduledTask(task as any) // TODO
}

/**
 * Registers a queue worker with the Pikku framework.
 * Workers process background jobs from queues.
 * 
 * @param queueWorker - Queue worker definition with job handler
 */
export const addQueueWorker = (queueWorker: QueueWorker<any, any>) => {
  addCoreQueueWorker(queueWorker as any) // TODO
}

/**
 * Registers an MCP resource with the Pikku framework.
 * Resources provide data that AI models can access.
 * 
 * @template In - Input type for the resource request
 * @param mcpResource - MCP resource definition with data provider function
 */
export const addMCPResource = <In>(
  mcpResource: MCPResource<In>
) => {
  addCoreMCPResource(mcpResource as any)
}

/**
 * Registers an MCP tool with the Pikku framework.
 * Tools are functions that AI models can invoke.
 * 
 * @template In - Input type for the tool invocation
 * @param mcpTool - MCP tool definition with action function
 */
export const addMCPTool = <In>(
  mcpTool: MCPTool<In>
) => {
  addCoreMCPTool(mcpTool as any)
}

/**
 * Registers an MCP prompt with the Pikku framework.
 * Prompts provide templates that AI models can use.
 * 
 * @template In - Input type for the prompt parameters
 * @param mcpPrompt - MCP prompt definition with template function
 */
export const addMCPPrompt = <In>(
  mcpPrompt: MCPPrompt<In>
) => {
  addCoreMCPPrompt(mcpPrompt as any)
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
    | APIFunctionSessionless<In, MCPPromptResponse>
    | {
        func: APIFunctionSessionless<In, MCPPromptResponse>
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
    | APIFunctionSessionless<In, MCPToolResponse, null, true>
    | {
      func: APIFunctionSessionless<In, MCPToolResponse, null, true>
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
    | APIFunctionSessionless<In, MCPResourceResponse, null, true>
    | {
      func: APIFunctionSessionless<In, MCPResourceResponse, null, true>
      name?: string
    }
) => {
  return typeof func === 'function' ? func : func.func
}
`
}
