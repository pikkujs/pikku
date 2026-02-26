export const serializeAddonTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  configTypeImport: string,
  requiredServicesTypeImport: string,
  typedSecretServiceImport: string,
  typedVariablesServiceImport: string
) => {
  return `/**
 * External package types for pikkuAddonConfig and pikkuAddonServices
 */

import type { CreateConfig } from '@pikku/core'
${singletonServicesTypeImport}
${configTypeImport}
${requiredServicesTypeImport}
${typedSecretServiceImport}
${typedVariablesServiceImport}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}
${configTypeImport.includes('Config type not found') ? 'type Config = any' : ''}

/**
 * Base services provided to addon package service factories.
 * These are always available from the parent application.
 */
export type AddonBaseServices = {
  logger: SingletonServices['logger']
  variables: TypedVariablesService
  secrets: TypedSecretService
}

/**
 * Creates a Pikku config factory for addon packages.
 * Unlike pikkuConfig, this receives AddonBaseServices (logger, variables, secrets)
 * from the parent application, so addon packages can read variables/secrets during config creation.
 */
export const pikkuAddonConfig = <ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & AddonBaseServices>(
  func: (services: ExistingServices) => Promise<Config>
): CreateConfig<Config> => {
  return (async (_variables: any, existingServices?: Partial<SingletonServices>): Promise<Config> => {
    const { secrets, variables, ...rest } = (existingServices ?? {}) as unknown as SingletonServices
    return func({ ...rest, secrets: new TypedSecretService(secrets), variables: new TypedVariablesService(variables) } as ExistingServices)
  }) as unknown as CreateConfig<Config>
}

/**
 * Creates a Pikku singleton services factory for addon packages.
 * Unlike pikkuServices, this expects the parent application to provide
 * logger, variables, and secrets - no fallbacks needed.
 *
 * @param func - Addon services factory function that receives config and base services
 * @returns The singleton services factory function
 *
 * @example
 * \`\`\`typescript
 * export const createSingletonServices = pikkuAddonServices(async (
 *   config,
 *   { secrets }
 * ) => {
 *   const creds = await secrets.getSecretJSON<GithubCredentials>('GITHUB_CREDENTIALS')
 *   const github = new GithubService(creds)
 *   return { github }
 * })
 * \`\`\`
 */
export const pikkuAddonServices = <T extends Record<string, any>, ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & AddonBaseServices>(
  func: (config: Config, services: ExistingServices) => Promise<T>
) => {
  return async (config: Config, existingServices?: Partial<SingletonServices>): Promise<RequiredSingletonServices> => {
    const { logger, variables, secrets } = (existingServices ?? {}) as unknown as SingletonServices
    const typedVariables = new TypedVariablesService(variables)
    const typedSecrets = new TypedSecretService(secrets)
    const result = await func(config, { ...existingServices, logger, variables: typedVariables, secrets: typedSecrets } as ExistingServices)
    return {
      config,
      logger,
      variables: typedVariables,
      secrets: typedSecrets,
      ...result,
    } as unknown as RequiredSingletonServices
  }
}
`
}
