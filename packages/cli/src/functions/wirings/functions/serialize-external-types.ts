export const serializeExternalTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  configTypeImport: string,
  requiredServicesTypeImport: string,
  typedSecretServiceImport: string,
  typedVariablesServiceImport: string
) => {
  return `/**
 * External package types for pikkuExternalConfig and pikkuExternalServices
 */

${singletonServicesTypeImport}
${configTypeImport}
${requiredServicesTypeImport}
${typedSecretServiceImport}
${typedVariablesServiceImport}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}
${configTypeImport.includes('Config type not found') ? 'type Config = any' : ''}

/**
 * Base services provided to external package service factories.
 * These are always available from the parent application.
 */
export type ExternalBaseServices = {
  logger: SingletonServices['logger']
  variables: TypedVariablesService
  secrets: TypedSecretService
}

/**
 * Creates a Pikku config factory for external packages.
 * Unlike pikkuConfig, this receives ExternalBaseServices (logger, variables, secrets)
 * from the parent application, so external packages can read variables/secrets during config creation.
 */
export const pikkuExternalConfig = <ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & ExternalBaseServices>(
  func: (services: ExistingServices) => Promise<Config>
) => {
  return async (_variables: any, existingServices?: Partial<SingletonServices>): Promise<Config> => {
    const { secrets, variables, ...rest } = existingServices as unknown as SingletonServices
    return func({ ...rest, secrets: new TypedSecretService(secrets), variables: new TypedVariablesService(variables) } as ExistingServices)
  }
}

/**
 * Creates a Pikku singleton services factory for external packages.
 * Unlike pikkuServices, this expects the parent application to provide
 * logger, variables, and secrets - no fallbacks needed.
 *
 * @param func - External services factory function that receives config and base services
 * @returns The singleton services factory function
 *
 * @example
 * \`\`\`typescript
 * export const createSingletonServices = pikkuExternalServices(async (
 *   config,
 *   { secrets }
 * ) => {
 *   const creds = await secrets.getSecretJSON<GithubCredentials>('GITHUB_CREDENTIALS')
 *   const github = new GithubService(creds)
 *   return { github }
 * })
 * \`\`\`
 */
export const pikkuExternalServices = <T extends Record<string, any>, ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & ExternalBaseServices>(
  func: (config: Config, services: ExistingServices) => Promise<T>
) => {
  return async (config: Config, existingServices?: Partial<SingletonServices>): Promise<RequiredSingletonServices> => {
    const { logger, variables, secrets } = existingServices as unknown as SingletonServices
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
