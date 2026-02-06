/**
 * Generates core function, middleware, and permission type definitions
 */
export const serializeFunctionTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  wireServicesTypeImport: string,
  wireServicesTypeName: string,
  rpcMapTypeImport: string,
  requiredServicesTypeImport: string,
  configTypeImport: string,
  packageName?: string,
  workflowTypesImport?: string
) => {
  const packageNameValue = packageName ? `'${packageName}'` : 'null'
  const workflowImport =
    workflowTypesImport ||
    `import type { TypedWorkflow } from '../workflow/pikku-workflow-types.gen.js'`

  return `/**
 * Core function, middleware, and permission types for all wirings
 */

import { CorePikkuFunctionConfig, CorePikkuPermission, CorePikkuMiddleware, CorePermissionGroup, addMiddleware as addMiddlewareCore, addPermission as addPermissionCore, PikkuWire, PickRequired, CreateWireServices } from '@pikku/core'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { CorePikkuFunction, CorePikkuFunctionSessionless } from '@pikku/core/function'

${userSessionTypeImport}
${singletonServicesTypeImport}
${wireServicesTypeImport}
${configTypeImport}
${rpcMapTypeImport}
${requiredServicesTypeImport}
${workflowImport}

${singletonServicesTypeName !== 'SingletonServices' ? `export type SingletonServices = ${singletonServicesTypeName}` : `export type { ${singletonServicesTypeName} as SingletonServices }`}
${wireServicesTypeName !== 'Services' ? `export type Services = ${wireServicesTypeName}` : `export type { ${wireServicesTypeName} as Services }`}
${userSessionTypeName !== 'Session' ? `export type Session = ${userSessionTypeName}` : `export type { ${userSessionTypeName} as Session }`}
${configTypeImport.includes('Config type not found') ? 'export type Config = any' : ''}

/**
 * Type-safe API permission definition that integrates with your application's session type.
 * Use this to define authorization logic for your API endpoints.
 *
 * @template In - The input type that the permission check will receive
 * @template RequiredServices - The services required for this permission check
 */
export type PikkuPermission<In = unknown, RequiredServices extends Services = Services> = CorePikkuPermission<In, RequiredServices, PikkuWire<In, never, false, Session>>

/**
 * Type-safe middleware definition that can access your application's services and session.
 * Use this to define reusable middleware that can be applied to multiple wirings.
 *
 * @template RequiredServices - The services required for this middleware
 */
export type PikkuMiddleware<RequiredServices extends SingletonServices = SingletonServices> = CorePikkuMiddleware<RequiredServices>

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
 * const permission = pikkuPermission(async ({ logger }, data, { session }) => {
 *   const session = await session?.get()
 *   return session?.role === 'admin'
 * })
 *
 * // Configuration object syntax with metadata
 * const adminPermission = pikkuPermission({
 *   name: 'Admin Permission',
 *   description: 'Checks if user has admin role',
 *   func: async ({ logger }, data, { session }) => {
 *     const session = await session?.get()
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
 * const middleware = pikkuMiddleware(({ logger }, wires, next) => {
 *   logger.info('Middleware executed')
 *   await next()
 * })
 *
 * // Configuration object syntax with metadata
 * const logMiddleware = pikkuMiddleware({
 *   name: 'Request Logger',
 *   description: 'Logs all incoming requests',
 *   func: async ({ logger }, wires, next) => {
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
 *   return pikkuMiddleware(async ({ logger }, next) => {
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
 *   return pikkuPermission(async ({ logger }, data, { initialSession }) => {
 *     if (!initialSession || initialSession.role !== role) {
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
 * @template RequiredServices - Services required by this function
 */
export type PikkuFunctionSessionless<
  In = unknown,
  Out = never,
  RequiredWires extends keyof PikkuWire = never,
  RequiredServices extends Services = Services
> = CorePikkuFunctionSessionless<
    In,
    Out,
    RequiredServices,
    PickRequired<PikkuWire<In, Out, false, Session, TypedPikkuRPC, null, any, TypedWorkflow>, RequiredWires>
  >

/**
 * A session-aware API function that requires user authentication.
 * Use this for protected endpoints that need access to user session data.
 *
 * @template In - The input type
 * @template Out - The output type that the function returns
 * @template RequiredServices - Services required by this function
 */
export type PikkuFunction<
  In = unknown,
  Out = never,
  RequiredWires extends keyof PikkuWire = 'session',
  RequiredServices extends Services = Services
> = CorePikkuFunction<
    In,
    Out,
    RequiredServices,
    PickRequired<PikkuWire<In, Out, true, Session, TypedPikkuRPC, null, any, TypedWorkflow>, RequiredWires>
  >

/**
 * Helper type to infer the output type from a Standard Schema
 */
export type InferSchemaOutput<T> = T extends StandardSchemaV1<any, infer Output> ? Output : never

/**
 * Configuration object for Pikku functions with optional middleware, permissions, tags, and documentation.
 * This type wraps CorePikkuFunctionConfig with the user's custom types.
 *
 * @template In - The input type
 * @template Out - The output type
 * @template PikkuFunc - The function type (can be narrowed to PikkuFunction or PikkuFunctionSessionless)
 */
export type PikkuFunctionConfig<
  In = unknown,
  Out = unknown,
  RequiredWires extends keyof PikkuWire = never,
  PikkuFunc extends PikkuFunction<In, Out, RequiredWires> | PikkuFunctionSessionless<In, Out, RequiredWires> = PikkuFunction<In, Out, RequiredWires> | PikkuFunctionSessionless<In, Out, RequiredWires>,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = CorePikkuFunctionConfig<PikkuFunc, PikkuPermission<In>, PikkuMiddleware, InputSchema, OutputSchema>

/**
 * Configuration object for Pikku functions with Zod schema validation.
 * Use this when you want to define input/output schemas using Zod.
 * Types are automatically inferred from the schemas.
 */
export type PikkuFunctionConfigWithSchema<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  RequiredWires extends keyof PikkuWire = never
> = {
  name?: string
  tags?: string[]
  expose?: boolean
  internal?: boolean
  func: PikkuFunction<
    InferSchemaOutput<InputSchema>,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    RequiredWires
  > | PikkuFunctionSessionless<
    InferSchemaOutput<InputSchema>,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    RequiredWires
  >
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>>
  middleware?: PikkuMiddleware[]
  input: InputSchema
  output?: OutputSchema
}

/**
 * Creates a Pikku function that can be either session-aware or sessionless.
 * This is the main function wrapper for creating API endpoints.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuFunc<Input, Output>({ func: ... })\`
 * 2. Zod schemas: \`pikkuFunc({ input: z.object(...), output: z.object(...), func: ... })\`
 *
 * @template In - Input type for the function (inferred from schema if provided)
 * @template Out - Output type for the function (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 *
 * @example
 * \`\`\`typescript
 * // Pattern 1: Using generic types
 * const createUser = pikkuFunc<{name: string, email: string}, {id: number}>({
 *   func: async ({db}, input) => {
 *     const user = await db.users.create(input)
 *     return { id: user.id }
 *   }
 * })
 *
 * // Pattern 2: Using Zod schemas (types inferred automatically)
 * const createUserInput = z.object({ name: z.string(), email: z.string() })
 * const createUserOutput = z.object({ id: z.number() })
 *
 * const createUser = pikkuFunc({
 *   input: createUserInput,
 *   output: createUserOutput,
 *   func: async ({db}, input) => {
 *     // input is typed as { name: string, email: string }
 *     const user = await db.users.create(input)
 *     return { id: user.id } // must match output schema
 *   }
 * })
 * \`\`\`
 */
export function pikkuFunc<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuFunctionConfigWithSchema<InputSchema, OutputSchema, 'session' | 'rpc'>
): PikkuFunctionConfig<InferSchemaOutput<InputSchema>, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'session' | 'rpc'>
export function pikkuFunc<In, Out = unknown>(
  func:
    | PikkuFunction<In, Out, 'session' | 'rpc'>
    | PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
): PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
export function pikkuFunc(func: any) {
  return typeof func === 'function' ? { func } : func
}

/**
 * Configuration object for sessionless Pikku functions with Zod schema validation.
 */
export type PikkuFunctionSessionlessConfigWithSchema<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  RequiredWires extends keyof PikkuWire = never
> = {
  name?: string
  description?: string
  tags?: string[]
  expose?: boolean
  internal?: boolean
  func: PikkuFunctionSessionless<
    InferSchemaOutput<InputSchema>,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown,
    RequiredWires
  >
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission<InferSchemaOutput<InputSchema>>>
  middleware?: PikkuMiddleware[]
  input: InputSchema
  output?: OutputSchema
}

/**
 * Creates a sessionless Pikku function that doesn't require user authentication.
 * Use this for public endpoints, webhooks, or background tasks.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuSessionlessFunc<Input, Output>({ func: ... })\`
 * 2. Zod schemas: \`pikkuSessionlessFunc({ input: z.object(...), func: ... })\`
 *
 * @template In - Input type for the function (inferred from schema if provided)
 * @template Out - Output type for the function (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 *
 * @example
 * \`\`\`typescript
 * // Pattern 1: Using generic types
 * const healthCheck = pikkuSessionlessFunc<void, {status: string}>({
 *   func: async ({logger}) => {
 *     return { status: 'healthy' }
 *   }
 * })
 *
 * // Pattern 2: Using Zod schemas
 * const greetInput = z.object({ name: z.string() })
 * const greetOutput = z.object({ message: z.string() })
 *
 * const greet = pikkuSessionlessFunc({
 *   input: greetInput,
 *   output: greetOutput,
 *   func: async (_services, { name }) => {
 *     return { message: \`Hello, \${name}!\` }
 *   }
 * })
 * \`\`\`
 */
export function pikkuSessionlessFunc<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuFunctionSessionlessConfigWithSchema<InputSchema, OutputSchema, 'session' | 'rpc'>
): PikkuFunctionConfig<InferSchemaOutput<InputSchema>, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, 'session' | 'rpc'>
export function pikkuSessionlessFunc<In, Out = unknown>(
  func:
    | PikkuFunctionSessionless<In, Out, 'session' | 'rpc'>
    | PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
): PikkuFunctionConfig<In, Out, 'session' | 'rpc'>
export function pikkuSessionlessFunc(func: any) {
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
 * \`\`\`typescript
 * const cleanupTempFiles = pikkuVoidFunc(async ({fileSystem, logger}) => {
 *     logger.info('Starting cleanup of temporary files')
 *     await fileSystem.deleteDirectory('/tmp/uploads')
 *     logger.info('Cleanup completed')
 * })
 * \`\`\`
 */
export const pikkuVoidFunc = (
  func:
    | PikkuFunctionSessionless<void, void, 'session' | 'rpc'>
    | PikkuFunctionConfig<void, void, 'session' | 'rpc'>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a wrapper function for external package functions that are exposed via RPC.
 * This allows you to wire external functions to any wiring type (HTTP, queue, etc.)
 * without type compatibility issues.
 *
 * @template Name - The RPC method name (must be a key in FlattenedRPCMap)
 * @param rpcName - The name of the RPC method to invoke
 * @returns A Pikku function that proxies calls to the external RPC method
 *
 * @example
 * \`\`\`typescript
 * // Wire an external function via HTTP
 * wireHTTP({
 *   auth: false,
 *   method: 'get',
 *   route: '/external/hello',
 *   func: external('ext:hello'),
 *   tags: ['external'],
 * })
 * \`\`\`
 */
export const external = <Name extends keyof FlattenedRPCMap>(
  rpcName: Name
): PikkuFunctionConfig<
  FlattenedRPCMap[Name]['input'],
  FlattenedRPCMap[Name]['output'],
  'session' | 'rpc'
> => {
  return {
    func: (async (_services: any, data: any, { rpc }: any) => {
      return rpc.invoke(rpcName, data)
    }) as any
  } as PikkuFunctionConfig<
    FlattenedRPCMap[Name]['input'],
    FlattenedRPCMap[Name]['output'],
    'session' | 'rpc'
  >
}

/**
 * Creates a Pikku config factory.
 * Use this to define your application's configuration factory.
 *
 * @param func - Config factory function that returns your application's config
 * @returns The config factory function
 *
 * @example
 * \`\`\`typescript
 * export const createConfig = pikkuConfig(async () => {
 *   return {
 *     apiUrl: process.env.API_URL || 'http://localhost:3000',
 *     dbUrl: process.env.DATABASE_URL
 *   }
 * })
 * \`\`\`
 */
export const pikkuConfig = (
  func: (variables?: any, ...args: any[]) => Promise<Config>
) => func


/**
 * Creates a Pikku singleton services factory.
 * Use this to define services that are created once and shared across all requests.
 *
 * @param func - Singleton services factory function
 * @returns The singleton services factory function
 *
 * @example
 * \`\`\`typescript
 * export const createSingletonServices = pikkuServices(async (config, existingServices) => {
 *   return {
 *     config,
 *     logger: new CustomLogger(),
 *     db: await createDatabaseConnection(config.dbUrl)
 *   }
 * })
 * \`\`\`
 */
export const pikkuServices = (
  func: (config: Config, existingServices?: Partial<SingletonServices>) => Promise<RequiredSingletonServices>
) => func

/**
 * Creates a Pikku wire services factory.
 * Use this to define services that are created per-request/session.
 *
 * @param func - Wire services factory function
 * @returns The wire services factory function
 *
 * @example
 * \`\`\`typescript
 * export const createWireServices = pikkuWireServices(async (services, wire) => {
 *   const session = await wire.session?.get()
 *   return {
 *     userCache: new UserCache(session?.userId)
 *   }
 * })
 * \`\`\`
 */
export const pikkuWireServices = (
  func: (
    services: SingletonServices,
    wire: any
  ) => Promise<RequiredWireServices>
): CreateWireServices => func as unknown as CreateWireServices

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
  addMiddlewareCore(tag, middleware as any, ${packageNameValue})
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
  addPermissionCore(tag, permissions as any, ${packageNameValue})
}
`
}
