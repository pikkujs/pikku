/**
 * Generates the authorization surface — who may call a function, and the
 * credentials a call is made with. Permissions and auth gates were on the
 * function leaf, where they sat next to the definers as if writing a function
 * meant deciding who could reach it; they are a separate decision, taken once
 * and reused across wirings, so they are a separate import.
 *
 * `PikkuPermission` is declared here rather than beside the function config that
 * references it; that config imports it back, which is a type-only edge and
 * carries no runtime cycle.
 */
export const serializeAuthGuards = (
  functionTypesImportPath: string,
  requiredServicesTypeImport: string,
  packageName?: string
) => {
  const packageNameValue = packageName ? `'${packageName}'` : 'null'

  return `/**
 * Permission, auth gate and credential definitions
 */

import type { PikkuWire, SecretlessServices } from '@pikku/core/types'
import type {
  CorePermissionGroup,
  CorePikkuAuth,
  CorePikkuAuthConfig,
  CorePikkuPermission,
} from '@pikku/core/function'
import { pikkuAuth as pikkuAuthCore } from '@pikku/core/function'
import { addGlobalPermission as addGlobalPermissionCore } from '@pikku/core/middleware'
import type {
  Services,
  Session,
  SingletonServices,
  WiredServices,
} from '${functionTypesImportPath}'
${requiredServicesTypeImport}

export { defineCredential } from '@pikku/core/credential'

/**
 * Derived here rather than imported: nothing outside a generated leaf ever
 * names this intersection, so the function leaf keeps it to itself and the
 * leaves that want it spell it out.
 */
type WiredSingletonServices = RequiredSingletonServices & SingletonServices

/** \`WiredSingletonServices\` without \`secrets\`, for auth gates. */
type WiredAuthServices = SecretlessServices<WiredSingletonServices>

/**
 * Type-safe API permission definition that integrates with your application's session type.
 * Use this to define authorization logic for your API endpoints.
 *
 * @template In - The input type that the permission check will receive
 * @template RequiredServices - The services required for this permission check
 */
export type PikkuPermission<In = unknown, RequiredServices extends SecretlessServices<Services> = WiredServices> = CorePikkuPermission<In, RequiredServices, PikkuWire<In, never, false, Session>>

/**
 * Configuration object for creating a permission with metadata
 */
type PikkuPermissionConfig<In = unknown, RequiredServices extends SecretlessServices<Services> = WiredServices> = {
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
 * Type-safe auth-only permission that only needs services and session.
 * Use this for upfront authorization gates (MCP tools, AI agents, workflows)
 * where request data isn't available yet.
 *
 * @template RequiredServices - The services required for this auth check
 */
type PikkuAuth<RequiredServices extends SecretlessServices<SingletonServices> = WiredAuthServices> = CorePikkuAuth<RequiredServices, Session>

/**
 * Configuration object for creating an auth permission with metadata
 */
type PikkuAuthConfig<RequiredServices extends SecretlessServices<SingletonServices> = WiredAuthServices> = CorePikkuAuthConfig<RequiredServices, Session>

/**
 * Factory function for creating auth-only permissions with tree-shaking support.
 * Auth permissions only receive services and session (no request data),
 * making them evaluable before request data is available.
 *
 * @example
 * \\\`\\\`\\\`typescript
 * const isAuthenticated = pikkuAuth(async ({ logger }, session) => {
 *   return !!session
 * })
 *
 * const isAdmin = pikkuAuth({
 *   name: 'Admin Auth',
 *   description: 'Checks if user is an admin',
 *   func: async ({ logger }, session) => {
 *     return session?.role === 'admin'
 *   }
 * })
 * \\\`\\\`\\\`
 */
export const pikkuAuth = <RequiredServices extends SecretlessServices<SingletonServices> = WiredAuthServices>(
  auth: PikkuAuth<RequiredServices> | PikkuAuthConfig<RequiredServices>
): PikkuPermission<any, any> => {
  return pikkuAuthCore(auth as any) as any
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
 *   return pikkuPermission(async ({ logger }, data, { session }) => {
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
 * Wire-agnostic global permissions. Runs at the top of every wiring's
 * permission resolution — before wire-, tag-, and function-level entries.
 *
 * Resolution order: global -> wire -> tag -> function.
 *
 * @example
 * addGlobalPermission([signedInUser])
 */
export const addGlobalPermission = <In = unknown>(permissions: CorePermissionGroup<PikkuPermission<In>> | PikkuPermission<In>[]) => {
  addGlobalPermissionCore(permissions as any, ${packageNameValue})
}
`
}
