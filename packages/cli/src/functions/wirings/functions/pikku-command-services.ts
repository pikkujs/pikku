import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const serializeServicesMap = (
  requiredServices: Set<string>,
  forceRequiredServices: string[] = [],
  servicesImport: string,
  sessionServicesImport: string
): string => {
  // Use pre-aggregated services from inspector state
  // This includes services from:
  // - Wired functions (HTTP, channels, queues, schedulers, MCP, CLI, RPC)
  // - Middleware used by wired functions
  // - Permissions used by wired functions
  // - Session factories
  const usedServices = new Set(requiredServices)

  // Internal services that are created internally and not via the create service script
  const internalServices = new Set(['rpc', 'mcp', 'channel', 'userSession'])

  // Add force-required services that might not be detected from function inspection
  forceRequiredServices.forEach((service) => {
    if (!internalServices.has(service)) {
      usedServices.add(service)
    }
  })

  // Create a map of services with true for all needed services
  const servicesMap = Object.fromEntries(
    Array.from(usedServices)
      .sort()
      .map((service) => [service, true])
  )

  // Generate the TypeScript code
  const serviceKeys = Object.keys(servicesMap).sort()

  // Services that are always required internally by the framework
  const defaultServices = ['config', 'logger', 'variables', 'schema']

  // Combine default services with detected services
  const allRequiredServices = [
    ...new Set([...defaultServices, ...serviceKeys]),
  ].sort()

  // For RequiredSingletonServices, we need to pick from the actual SingletonServices interface
  // This will be resolved at compile time based on what's actually in the SingletonServices interface
  // We don't need to hardcode which services are singletons beyond the core framework ones

  const code = [
    servicesImport,
    sessionServicesImport,
    "import type { PikkuInteraction } from '@pikku/core'",
    '',
    'export const singletonServices = {',
    ...Object.keys(servicesMap).map((service) => `    '${service}': true,`),
    '} as const',
    '',
    '// Singleton services (created once at startup)',
    '// Only includes services that are both required and available in SingletonServices',
    `export type RequiredSingletonServices = Pick<SingletonServices, Extract<keyof SingletonServices, ${allRequiredServices.map((key) => `'${key}'`).join(' | ')}>> & Partial<Omit<SingletonServices, ${allRequiredServices.map((key) => `'${key}'`).join(' | ')}>>`,
    '',
    '// Session services (created per request, can access singleton services)',
    '// Omits singleton services and PikkuInteraction (mcp, rpc, http, channel)',
    `export type RequiredSessionServices = Omit<Services, keyof SingletonServices | keyof PikkuInteraction>`,
    '',
  ].join('\n')

  return code
}

export const pikkuServices: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      sessionServiceType: true,
      singletonServicesType: true,
    })

    const { sessionServicesType, singletonServicesType } =
      visitState.filesAndMethods

    if (!sessionServicesType || !singletonServicesType) {
      throw new Error(
        'Required types not found: sessionServicesType or singletonServicesType'
      )
    }

    const servicesImport = `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, singletonServicesType.typePath, config.packageMappings)}'`
    const sessionServicesImport = `import type { ${sessionServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, sessionServicesType.typePath, config.packageMappings)}'`

    const servicesCode = serializeServicesMap(
      visitState.serviceAggregation.requiredServices,
      config.forceRequiredServices,
      servicesImport,
      sessionServicesImport
    )
    await writeFileInDir(logger, config.servicesFile, servicesCode)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Pikku services map',
      commandEnd: 'Generated Pikku services map',
      skipMessage: '',
    }),
  ],
})
