/**
 * Generates core function, middleware, and permission type definitions
 */
export const serializeFunctionTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  sessionServicesTypeImport: string,
  sessionServicesTypeName: string,
  rpcMapTypeImport: string
) => {
  return `/**
 * Core function, middleware, and permission types for all wirings
 */

import { CorePikkuFunctionConfig, CorePikkuPermission, CorePikkuMiddleware, CorePermissionGroup, addMiddleware as addMiddlewareCore, addPermission as addPermissionCore } from '@pikku/core'
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
export type PikkuPermission<In = unknown, RequiredServices extends Services = Services> = CorePikkuPermission<In, RequiredServices, Session>

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple wirings.
 *
 * @template RequiredServices - The services required for this middleware
 */
export type PikkuMiddleware<RequiredServices extends SingletonServices = SingletonServices> = CorePikkuMiddleware<RequiredServices, Session>

/**
 * Configuration object for creating a permission with metadata
 */
export type PikkuPermissionConfig<In = unknown, RequiredServices extends Services = Services> = {
  /** The permission function */
  func: PikkuPermission<In, RequiredServices>
  /** Optional human-readable name for the permission */
  name?: string
  /** Optional description of what the permission checks */
  description?: string
}

/**
 * Factory function for creating permissions with tree-shaking support.
 * Supports both direct function and configuration object syntax.
 *
 * @example
 * \`\`\`typescript
 * // Direct function syntax
 * const permission = pikkuPermission(({ logger }, data, session) => {
 *   return session?.role === 'admin'
 * })
 *
 * // Configuration object syntax with metadata
 * const adminPermission = pikkuPermission({
 *   name: 'Admin Permission',
 *   description: 'Checks if user has admin role',
 *   func: async ({ logger }, data, session) => {
 *     return session?.role === 'admin'
 *   }
 * })
 * \`\`\`
 */
export const pikkuPermission = <In>(
  permission: PikkuPermission<In> | PikkuPermissionConfig<In>
): PikkuPermission<In> => {
  return typeof permission === 'function' ? permission : permission.func
}

/**
 * Configuration object for creating middleware with metadata
 */
export type PikkuMiddlewareConfig<RequiredServices extends SingletonServices = SingletonServices> = {
  /** The middleware function */
  func: PikkuMiddleware<RequiredServices>
  /** Optional human-readable name for the middleware */
  name?: string
  /** Optional description of what the middleware does */
  description?: string
}

/**
 * Factory function for creating middleware with tree-shaking support.
 * Supports both direct function and configuration object syntax.
 *
 * @example
 * \`\`\`typescript
 * // Direct function syntax
 * const middleware = pikkuMiddleware(({ logger }, interactions, next) => {
 *   logger.info('Middleware executed')
 *   await next()
 * })
 *
 * // Configuration object syntax with metadata
 * const logMiddleware = pikkuMiddleware({
 *   name: 'Request Logger',
 *   description: 'Logs all incoming requests',
 *   func: async ({ logger }, interactions, next) => {
 *     logger.info('Request started')
 *     await next()
 *   }
 * })
 * \`\`\`
 */
export const pikkuMiddleware = <RequiredServices extends SingletonServices = SingletonServices>(
  middleware: PikkuMiddleware<RequiredServices> | PikkuMiddlewareConfig<RequiredServices>
): PikkuMiddleware<RequiredServices> => {
  return typeof middleware === 'function' ? middleware : middleware.func
}

/**
 * Factory function for creating middleware factories
 * Use this when your middleware needs configuration/input parameters
 *
 * @example
 * \`\`\`typescript
 * export const logMiddleware = pikkuMiddlewareFactory<LogOptions>(({
 *   message,
 *   level = 'info'
 * }) => {
 *   return pikkuMiddleware(async ({ logger }, _interaction, next) => {
 *     logger[level](message)
 *     await next()
 *   })
 * })
 * \`\`\`
 */
export const pikkuMiddlewareFactory = <In = any>(
  factory: (input: In) => PikkuMiddleware
): ((input: In) => PikkuMiddleware) => {
  return factory
}

/**
 * Factory function for creating permission factories
 * Use this when your permission needs configuration/input parameters
 *
 * @example
 * \`\`\`typescript
 * export const requireRole = pikkuPermissionFactory<{ role: string }>(({
 *   role
 * }) => {
 *   return pikkuPermission(async ({ logger }, data, session) => {
 *     if (!session || session.role !== role) {
 *       logger.warn(\`Permission denied: required role '\${role}'\`)
 *       return false
 *     }
 *     return true
 *   })
 * })
 * \`\`\`
 */
export const pikkuPermissionFactory = <In = any>(
  factory: (input: In) => PikkuPermission<any>
): ((input: In) => PikkuPermission<any>) => {
  return factory
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
export type PikkuFunctionSessionless<
  In = unknown,
  Out = never,
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Omit<Services, 'rpc' | 'channel' | 'mcp'> &
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
export type PikkuFunction<
  In = unknown,
  Out = never,
  ChannelData = null,  // null means optional channel
  MCPData = null, // null means optional MCP
  RequiredServices extends Services = Omit<Services, 'rpc' | 'channel' | 'mcp'> &
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
 * Configuration object for Pikku functions with optional middleware, permissions, tags, and documentation.
 * This type wraps CorePikkuFunctionConfig with the user's custom types.
 *
 * @template In - The input type
 * @template Out - The output type
 * @template ChannelData - Channel data type
 * @template MCPData - MCP data type
 * @template PikkuFunc - The function type (can be narrowed to PikkuFunction or PikkuFunctionSessionless)
 */
export type PikkuFunctionConfig<
  In = unknown,
  Out = unknown,
  ChannelData = unknown,
  MCPData = unknown,
  PikkuFunc extends PikkuFunction<In, Out, ChannelData, MCPData> | PikkuFunctionSessionless<In, Out, ChannelData, MCPData> = PikkuFunction<In, Out, ChannelData, MCPData> | PikkuFunctionSessionless<In, Out, ChannelData, MCPData>
> = CorePikkuFunctionConfig<PikkuFunc, PikkuPermission<In>, PikkuMiddleware>

/**
 * Creates a Pikku function that can be either session-aware or sessionless.
 * This is the main function wrapper for creating API endpoints.
 *
 * @template In - Input type for the function
 * @template Out - Output type for the function
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
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
    | CorePikkuFunctionConfig<PikkuFunction<In, Out>, PikkuPermission<In>, PikkuMiddleware>
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
 * @returns The normalized configuration object
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
 * @returns The normalized configuration object
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
export const addMiddleware = (tag: string, middleware: PikkuMiddleware[]) => {
  addMiddlewareCore(tag, middleware as any)
}

/**
 * Adds global permissions for a specific tag.
 *
 * This function allows you to register permissions that will be applied to
 * any wiring (HTTP, Channel, Queue, Scheduler, MCP) that includes the matching tag.
 *
 * @param tag - The tag that the permissions should apply to.
 * @param permissions - The permissions array or object to apply for the specified tag.
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
 * // Add read permissions for all API endpoints (as object)
 * addPermission('api', { read: readPermission })
 * \`\`\`
 */
export const addPermission = <In = unknown>(tag: string, permissions: CorePermissionGroup<PikkuPermission<In>> | PikkuPermission<In>[]) => {
  addPermissionCore(tag, permissions as any)
}
`
}
