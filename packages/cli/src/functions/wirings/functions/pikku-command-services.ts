import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const serializeServicesMap = (
  allSingletonServices: string[],
  allWireServices: string[],
  requiredServices: Set<string>,
  forceRequiredServices: string[] = [],
  servicesImport: string,
  wireServicesImport: string
): string => {
  // Use pre-aggregated services from inspector state
  // This includes services from:
  // - Wired functions (HTTP, channels, queues, schedulers, MCP, CLI, RPC)
  // - Middleware used by wired functions
  // - Permissions used by wired functions
  // - Session factories
  const usedServices = new Set(requiredServices)

  // Internal services that are created internally by the framework (PikkuWire)
  // These should not appear in the services maps
  const internalServices = new Set([
    'rpc',
    'mcp',
    'channel',
    'userSession',
    'cli',
    'http',
    'queue',
    'scheduledTask',
  ])

  // Add force-required services that might not be detected from function inspection
  forceRequiredServices.forEach((service) => {
    if (!internalServices.has(service)) {
      usedServices.add(service)
    }
  })

  // Services that are always required internally by the framework
  const defaultServices = ['config', 'logger', 'variables', 'schema', 'secrets']
  defaultServices.forEach((service) => usedServices.add(service))

  // Create singleton services map: all singleton services with true/false based on usage
  const singletonServicesMap: Record<string, boolean> = {}
  allSingletonServices.forEach((service) => {
    singletonServicesMap[service] = usedServices.has(service)
  })

  // Create wire services map: all wire services with true/false based on usage
  // Exclude internal framework services (PikkuWire)
  const wireServicesMap: Record<string, boolean> = {}
  allWireServices.forEach((service) => {
    if (!internalServices.has(service)) {
      wireServicesMap[service] = usedServices.has(service)
    }
  })

  // Get all required service names (those marked as true)
  const requiredSingletonServiceNames = Object.keys(singletonServicesMap)
    .filter((key) => singletonServicesMap[key])
    .sort()
  const requiredWireServiceNames = Object.keys(wireServicesMap)
    .filter((key) => wireServicesMap[key])
    .sort()

  const code = [
    servicesImport,
    wireServicesImport,
    '',
    '// Singleton services map: true if required, false if available but unused',
    'export const requiredSingletonServices = {',
    ...Object.keys(singletonServicesMap)
      .sort()
      .map((service) => `  '${service}': ${singletonServicesMap[service]},`),
    '} as const',
    '',
    '// Wire services map: true if required, false if available but unused',
    'export const requiredWireServices = {',
    ...Object.keys(wireServicesMap)
      .sort()
      .map((service) => `  '${service}': ${wireServicesMap[service]},`),
    '} as const',
    '',
    '// Type exports',
    requiredSingletonServiceNames.length > 0
      ? `export type RequiredSingletonServices = Pick<SingletonServices, ${requiredSingletonServiceNames.map((key) => `'${key}'`).join(' | ')}> & Partial<Omit<SingletonServices, ${requiredSingletonServiceNames.map((key) => `'${key}'`).join(' | ')}>>`
      : 'export type RequiredSingletonServices = Partial<SingletonServices>',
    '',
    requiredWireServiceNames.length > 0
      ? `export type RequiredWireServices = Pick<Services, ${requiredWireServiceNames.map((key) => `'${key}'`).join(' | ')}> & Partial<Omit<Services, ${requiredWireServiceNames.map((key) => `'${key}'`).join(' | ')}>>`
      : 'export type RequiredWireServices = Partial<Services>',
    '',
  ].join('\n')

  return code
}

export const pikkuServices: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      wireServiceType: true,
      singletonServicesType: true,
    })

    const { wireServicesType, singletonServicesType } =
      visitState.filesAndMethods

    if (!wireServicesType || !singletonServicesType) {
      throw new Error(
        'Required types not found: wireServicesType or singletonServicesType'
      )
    }

    const servicesImport = `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, singletonServicesType.typePath, config.packageMappings)}'`
    const wireServicesImport = `import type { ${wireServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, wireServicesType.typePath, config.packageMappings)}'`

    const servicesCode = serializeServicesMap(
      visitState.serviceAggregation.allSingletonServices,
      visitState.serviceAggregation.allWireServices,
      visitState.serviceAggregation.requiredServices,
      config.forceRequiredServices,
      servicesImport,
      wireServicesImport
    )
    await writeFileInDir(logger, config.servicesFile, servicesCode)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Pikku services map',
      commandEnd: 'Generated Pikku services map',
    }),
  ],
})
