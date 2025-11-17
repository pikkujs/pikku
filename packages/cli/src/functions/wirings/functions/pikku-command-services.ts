import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const serializeServicesMap = (
  allSingletonServices: string[],
  allInteractionServices: string[],
  requiredServices: Set<string>,
  forceRequiredServices: string[] = [],
  servicesImport: string,
  interactionServicesImport: string
): string => {
  // Use pre-aggregated services from inspector state
  // This includes services from:
  // - Wired functions (HTTP, channels, queues, schedulers, MCP, CLI, RPC)
  // - Middleware used by wired functions
  // - Permissions used by wired functions
  // - Session factories
  const usedServices = new Set(requiredServices)

  // Internal services that are created internally by the framework (PikkuInteraction)
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
  const defaultServices = ['config', 'logger', 'variables', 'schema']
  defaultServices.forEach((service) => usedServices.add(service))

  // Create singleton services map: all singleton services with true/false based on usage
  const singletonServicesMap: Record<string, boolean> = {}
  allSingletonServices.forEach((service) => {
    singletonServicesMap[service] = usedServices.has(service)
  })

  // Create interaction services map: all interaction services with true/false based on usage
  // Exclude internal framework services (PikkuInteraction)
  const interactionServicesMap: Record<string, boolean> = {}
  allInteractionServices.forEach((service) => {
    if (!internalServices.has(service)) {
      interactionServicesMap[service] = usedServices.has(service)
    }
  })

  // Get all required service names (those marked as true)
  const requiredSingletonServiceNames = Object.keys(singletonServicesMap)
    .filter((key) => singletonServicesMap[key])
    .sort()
  const requiredInteractionServiceNames = Object.keys(interactionServicesMap)
    .filter((key) => interactionServicesMap[key])
    .sort()

  const code = [
    servicesImport,
    interactionServicesImport,
    '',
    '// Singleton services map: true if required, false if available but unused',
    'export const requiredSingletonServices = {',
    ...Object.keys(singletonServicesMap)
      .sort()
      .map((service) => `  '${service}': ${singletonServicesMap[service]},`),
    '} as const',
    '',
    '// Interaction services map: true if required, false if available but unused',
    'export const requiredInteractionServices = {',
    ...Object.keys(interactionServicesMap)
      .sort()
      .map((service) => `  '${service}': ${interactionServicesMap[service]},`),
    '} as const',
    '',
    '// Type exports',
    requiredSingletonServiceNames.length > 0
      ? `export type RequiredSingletonServices = Pick<SingletonServices, ${requiredSingletonServiceNames.map((key) => `'${key}'`).join(' | ')}> & Partial<Omit<SingletonServices, ${requiredSingletonServiceNames.map((key) => `'${key}'`).join(' | ')}>>`
      : 'export type RequiredSingletonServices = Partial<SingletonServices>',
    '',
    requiredInteractionServiceNames.length > 0
      ? `export type RequiredInteractionServices = Pick<Services, ${requiredInteractionServiceNames.map((key) => `'${key}'`).join(' | ')}> & Partial<Omit<Services, ${requiredInteractionServiceNames.map((key) => `'${key}'`).join(' | ')}>>`
      : 'export type RequiredInteractionServices = Partial<Services>',
    '',
  ].join('\n')

  return code
}

export const pikkuServices: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    // Check for required types
    checkRequiredTypes(visitState.filesAndMethodsErrors, {
      interactionServiceType: true,
      singletonServicesType: true,
    })

    const { interactionServicesType, singletonServicesType } =
      visitState.filesAndMethods

    if (!interactionServicesType || !singletonServicesType) {
      throw new Error(
        'Required types not found: interactionServicesType or singletonServicesType'
      )
    }

    const servicesImport = `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, singletonServicesType.typePath, config.packageMappings)}'`
    const interactionServicesImport = `import type { ${interactionServicesType.type} } from '${getFileImportRelativePath(config.typesDeclarationFile, interactionServicesType.typePath, config.packageMappings)}'`

    const servicesCode = serializeServicesMap(
      visitState.serviceAggregation.allSingletonServices,
      visitState.serviceAggregation.allInteractionServices,
      visitState.serviceAggregation.requiredServices,
      config.forceRequiredServices,
      servicesImport,
      interactionServicesImport
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
