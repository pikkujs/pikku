import { join } from 'node:path'

export const ADDONS_META_FILE = join('addon', 'pikku-addons-meta.gen.json')

export type AddonsMeta = Record<
  string,
  {
    package: string
    remote?: true
    functions?: Record<string, { expose?: true }>
  }
>

export const serializeAddonsMeta = (
  declarations: Iterable<[string, { package: string; remote?: boolean }]>,
  addonFunctions: Record<string, Record<string, { expose?: boolean }>>
): string => {
  const meta: AddonsMeta = {}
  for (const [namespace, decl] of declarations) {
    meta[namespace] = decl.remote
      ? { package: decl.package, remote: true }
      : {
          package: decl.package,
          functions: Object.fromEntries(
            Object.entries(addonFunctions[namespace] ?? {}).map(
              ([name, fn]) => [name, fn?.expose ? { expose: true } : {}]
            )
          ),
        }
  }
  return JSON.stringify(meta, null, 2)
}

/**
 * The install side of `#pikku/addon`, written for an application rather than an
 * addon. Installing an addon and authoring one are the same concept approached
 * from opposite ends, and a project is only ever one of the two — but they
 * cannot share a tree, because a runtime template maps `#pikku/*` onto a
 * sibling package through tsconfig `paths`, and `paths` are global to a tsx
 * process rather than scoped to the package that declared them. A linked
 * addon's leaves would otherwise resolve against the host application's, so an
 * addon generates its whole tree one level down and authors against
 * `#pikku/addon/<leaf>` — a depth at which an application has nothing to match,
 * leaving the resolver to fall back to Node's per-package `imports`.
 */
export const serializeAddonInstallTypes = (
  addonFunctionNames: Record<string, string[]> = {},
  addonContributorNames: Record<string, string[]> = {}
) => {
  const nonEmpty = (byPackage: Record<string, string[]>) =>
    Object.entries(byPackage).filter(([, names]) => names.length > 0)
  const packages = nonEmpty(addonFunctionNames)
  const contributorPackages = nonEmpty(addonContributorNames)

  // Nothing installed yet — the bootstrap run writes this before any addon's
  // metadata has been read, and a project with no addons never gets more.
  if (packages.length === 0 && contributorPackages.length === 0) {
    return `/**
 * Installing an addon into this application
 */

export { wireAddon, wireRemoteAddon } from '@pikku/core/addon'
`
  }

  const union = (names: string[]) =>
    names.map((name) => JSON.stringify(name)).join(' | ')
  const entries = (byPackage: [string, string[]][]) =>
    byPackage.length === 0
      ? '  // none'
      : byPackage
          .map(([pkg, names]) => `  ${JSON.stringify(pkg)}: ${union(names)}`)
          .join('\n')

  return `/**
 * Installing an addon into this application
 */

import { wireAddon as wireAddonCore } from '@pikku/core/addon'
import type { WireAddonConfig } from '@pikku/core/addon'

export { wireRemoteAddon } from '@pikku/core/addon'

/**
 * The functions each installed addon publishes. \`mcp\` and \`expose\` name them.
 */
type AddonFunctions = {
${entries(packages)}
}

type AddonFunctionName<Package extends string> =
  Package extends keyof AddonFunctions ? AddonFunctions[Package] : string

/**
 * The contributors each installed addon registers with \`defineContributors\`,
 * read from the addon's generated contributors meta. \`contributors\` names them.
 * An addon whose meta is not installed is not listed here, so its names fall
 * back to \`string\` and the build-time check (PKU363) is what catches a typo.
 */
type AddonContributors = {
${entries(contributorPackages)}
}

type AddonContributorName<Package extends string> =
  Package extends keyof AddonContributors ? AddonContributors[Package] : string

/**
 * Installs an addon into this project: its functions, wirings and scopes become
 * part of the app, under the namespace and options given here.
 *
 * \`mcp: true\` offers every function the addon itself declared as a tool; a list
 * names the functions to offer, checked against the ones the addon publishes.
 * \`expose\` works the same way for \`rpc.exposed\`, and \`false\` exposes none.
 * \`contributors\` names the contributors the addon registers; a name it does not
 * register is a type error.
 *
 * @example snippet: addonWiring
 */
export const wireAddon = <Package extends string>(
  config: Omit<
    WireAddonConfig,
    'package' | 'mcp' | 'expose' | 'contributors'
  > & {
    package: Package
    mcp?: boolean | AddonFunctionName<Package>[]
    expose?: boolean | AddonFunctionName<Package>[]
    contributors?: AddonContributorName<Package>[]
  }
): void => wireAddonCore(config)
`
}

export const serializeAddonTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  configTypeImport: string,
  requiredServicesTypeImport: string,
  typedSecretServiceImport: string,
  typedVariablesServiceImport: string,
  typedCredentialServiceImport: string | null = null
) => {
  return `/**
 * Addon package types for pikkuAddonConfig and pikkuAddonServices
 */

import type { CreateConfig } from '@pikku/core/types'
import type { PikkuWire } from '@pikku/core/types'
${singletonServicesTypeImport}
${configTypeImport}
${requiredServicesTypeImport}
${typedSecretServiceImport}
${typedVariablesServiceImport}
${typedCredentialServiceImport ? typedCredentialServiceImport : ''}

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}
${configTypeImport.includes('Config type not found') ? 'type Config = any' : ''}

/**
 * Base services provided to addon package service factories.
 * These are always available from the parent application.
 */
export type AddonBaseServices = {
  logger: SingletonServices['logger']
  variables: TypedVariablesService
  secrets: TypedSecretService${typedCredentialServiceImport ? `\n  credentials: TypedCredentialService` : ''}
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
 *   const creds = await secrets.getSecret<GithubCredentials>('GITHUB_CREDENTIALS')
 *   const github = new GithubService(creds.reveal())
 *   return { github }
 * })
 * \`\`\`
 */
export const pikkuAddonServices = <T extends Record<string, any>, ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & AddonBaseServices>(
  func: (config: Config, services: ExistingServices) => Promise<T>
) => {
  return async (config: Config, existingServices?: Partial<SingletonServices>): Promise<RequiredSingletonServices> => {
    const { logger, variables, secrets, schema } = (existingServices ?? {}) as unknown as SingletonServices
    const typedVariables = new TypedVariablesService(variables)
    const typedSecrets = new TypedSecretService(secrets)
    const result = await func(config, { ...existingServices, logger, variables: typedVariables, secrets: typedSecrets } as ExistingServices)
    return {
      config,
      logger,
      schema,
      variables: typedVariables,
      secrets: typedSecrets,
      ...result,
    } as unknown as RequiredSingletonServices
  }
}

/**
 * Creates a Pikku wire services factory for addon packages.
 * Wire services are created per-request and have access to the HTTP request context.
 *
 * @param func - Wire services factory function that receives singleton services and the wire context
 * @returns The wire services factory function
 *
 * @example
 * \`\`\`typescript
 * export const createWireServices = pikkuAddonWireServices(async (services, wire) => {
 *   const authHeader = wire.http?.request?.header('authorization')
 *   return { myService: new MyService(authHeader) }
 * })
 * \`\`\`
 */
export const pikkuAddonWireServices = <ExistingServices extends Omit<Partial<SingletonServices>, 'variables' | 'secrets'> & AddonBaseServices>(
  func: (services: ExistingServices, wire: PikkuWire) => Promise<Record<string, any>>
) => {
  return ((services: any, wire: PikkuWire) => {
    const typedVariables = new TypedVariablesService(services.variables)
    const typedSecrets = new TypedSecretService(services.secrets)
    return func({ ...services, variables: typedVariables, secrets: typedSecrets } as ExistingServices, wire)
  }) as any
}
`
}
