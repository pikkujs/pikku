/**
 * Generates the setup surface — the three factories a project declares exactly
 * once, at the point the application is brought up. Grouping them apart from
 * the function types keeps `#pikku/function` to what a feature imports every
 * day and `#pikku/setup` to what bootstrap imports and never touches again.
 */
export const serializeSetupTypes = (
  functionTypesImportPath: string,
  configTypeImport: string,
  configTypeName: string | undefined,
  requiredServicesTypeImport: string
) => {
  return `/**
 * Config and service factory definitions, declared once per application
 */

import { pikkuState as __pikkuState } from '@pikku/core/state'
import { CreateWireServices } from '@pikku/core/types'
import type { SingletonServices } from '${functionTypesImportPath}'
${configTypeImport}
${requiredServicesTypeImport}
${!configTypeName ? 'export type Config = any' : configTypeName === 'Config' ? 'export type { Config }' : `export type { ${configTypeName} as Config }`}

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
  func: (config: Config, existingServices: Partial<SingletonServices>) => Promise<Partial<Omit<RequiredSingletonServices, 'auth'>>>
) => {
  return async (config: Config, existingServices: Partial<SingletonServices> = {}) => {
    const createdServices = await func(config, existingServices)
    const services = { ...existingServices, ...createdServices }
    const authFactory = __pikkuState(null, 'package', 'authFactory')
    if (authFactory) {
      let authInstance: Promise<unknown> | undefined
      ;(services as any).auth = () => {
        authInstance ??= Promise.resolve()
          .then(() => authFactory(services as any))
          .catch((error) => {
            authInstance = undefined
            throw error
          })
        return authInstance
      }
    }
    const resolved = services as RequiredSingletonServices
    __pikkuState(null, 'package', 'singletonServices', resolved as any)
    return resolved
  }
}

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
): CreateWireServices => {
  const factories = __pikkuState(null, 'package', 'factories')
  __pikkuState(null, 'package', 'factories', { ...factories, createWireServices: func as any })
  return func as unknown as CreateWireServices
}
`
}
