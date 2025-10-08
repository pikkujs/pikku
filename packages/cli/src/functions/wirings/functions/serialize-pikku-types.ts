/**
 *
 */
export const serializePikkuTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  sessionServicesTypeImport: string,
  sessionServicesTypeName: string,
  rpcMapTypeImport: string
) => {
  return `/**
* This is used to provide the application types in the typescript project
* Core types only - wiring-specific types are in their respective directories for tree-shaking
*/

import { CorePikkuFunctionConfig, CorePikkuPermission, CorePikkuMiddleware, addMiddleware, addPermission } from '@pikku/core'
import { CorePikkuFunction, CorePikkuFunctionSessionless } from '@pikku/core/function'
import { PikkuChannel, PikkuMCP } from '@pikku/core'

${userSessionTypeImport}
${singletonServicesTypeImport}
${sessionServicesTypeImport}
${rpcMapTypeImport}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}
${sessionServicesTypeName !== 'Services' ? `type Services = ${sessionServicesTypeName}` : ''}
${userSessionTypeName !== 'Session' ? `type Session = ${userSessionTypeName}` : ''}

/**
 * Type-safe API permission definition that integrates with your application's session type.
 * Use this to define authorization logic for your API endpoints.
 * 
 * @template In - The input type that the permission check will receive
 * @template RequiredServices - The services required for this permission check
 */
type PikkuPermission<In = unknown, RequiredServices extends Services = Services> = CorePikkuPermission<In, RequiredServices, Session>

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple HTTP wirings.
 * 
 * @template RequiredServices - The services required for this middleware
 */
type PikkuMiddleware<RequiredServices extends SingletonServices = SingletonServices> = CorePikkuMiddleware<RequiredServices, Session>

/**
 * Factory function for creating permissions with tree-shaking support.
 * This enables the bundler to detect which services your permission actually uses.
 * 
 * @example
 * \`\`\`typescript
 * const permission = pikkuPermission(({ logger }, data, session) => {
 *   return session?.isAdmin || false
 * })
 * \`\`\`
 */
export const pikkuPermission = <In>(func: PikkuPermission<In>) => {
  return func
}

/**
 * Factory function for creating middleware with tree-shaking support.
 * This enables the bundler to detect which services your middleware actually uses.
 * 
 * @example
 * \`\`\`typescript
 * const middleware = pikkuMiddleware(({ logger }, interactions, next) => {
 *   logger.info('Middleware executed')
 *   await next()
 * })
 * \`\`\`
 */
export const pikkuMiddleware = (func: PikkuMiddleware) => {
  return func
}

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
  RequiredServices extends Services = Services &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  ) & ([MCPData] extends [null]
    ? { mcp?: PikkuMCP }  // Optional MCP
    : { mcp: PikkuMCP }  // Required MCP
  )
> = CorePikkuFunctionSessionless<In, Out, ChannelData, RequiredServices, Session>

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
> = CorePikkuFunction<In, Out, ChannelData, RequiredServices, Session>

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
  return typeof func === 'function' ? { func } : func
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
  return typeof func === 'function' ? { func } : func
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
    | CorePikkuFunctionConfig<PikkuFunctionSessionless<void, void>, PikkuPermission<void>>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Adds global middleware for a specific tag.
 * 
 * This function allows you to register middleware that will be applied to 
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 * 
 * @param tag - The tag that the middleware should apply to.
 * @param middleware - The middleware array to apply for the specified tag.
 * 
 * @throws Error if middleware for the tag already exists.
 * 
 * @example
 * \`\`\`typescript
 * // Add admin middleware for admin endpoints
 * addMiddleware('admin', [adminMiddleware])
 * 
 * // Add authentication middleware for auth endpoints
 * addMiddleware('auth', [authMiddleware])
 * 
 * // Add logging middleware for all API endpoints  
 * addMiddleware('api', [loggingMiddleware])
 * \`\`\`
 */
export { addMiddleware }

/**
 * Adds global permissions for a specific tag.
 * 
 * This function allows you to register permissions that will be applied to 
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 * 
 * @param tag - The tag that the permissions should apply to.
 * @param permissions - The permissions array to apply for the specified tag.
 * 
 * @throws Error if permissions for the tag already exist.
 * 
 * @example
 * \`\`\`typescript
 * // Add admin permissions for admin endpoints
 * addPermission('admin', [adminPermission])
 * 
 * // Add authentication permissions for auth endpoints
 * addPermission('auth', [authPermission])
 * 
 * // Add read permissions for all API endpoints
 * addPermission('api', [readPermission])
 * \`\`\`
 */
export { addPermission }

`
}
