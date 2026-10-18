import type {
  ContributorPlatform,
  EntryGenerationContext,
  PlatformServiceContributor,
} from '@pikku/deploy'
import {
  collectContributorImports,
  collectContributorLines,
  dedupeContributors,
} from '@pikku/deploy'

const SERVICES_TYPE = 'Record<string, any>'

export const devContributorPlatform = (
  requiredServices: Iterable<string>
): ContributorPlatform => {
  const serviceNames = [...requiredServices]
  return {
    serviceNames,
    needsQueue: serviceNames.includes('queueService'),
    needsWorkflow: serviceNames.includes('workflowService'),
    needsAgent: serviceNames.includes('agentRunner'),
  }
}

const devContext = (): EntryGenerationContext =>
  ({
    unit: { name: 'dev', role: 'function', services: [] },
    servicesType: SERVICES_TYPE,
  }) as unknown as EntryGenerationContext

export const serializeDevPlatformServices = (
  contributors: readonly PlatformServiceContributor[],
  platform: ContributorPlatform
): string => {
  const unique = dedupeContributors(contributors)
  const imports = collectContributorImports(unique, platform)
  const lines = collectContributorLines(unique, {
    ctx: devContext(),
    platform,
    isGateway: false,
  })
  return [
    ...imports,
    ...(imports.length > 0 ? [''] : []),
    `export const createPlatformServices = async (env: Record<string, string | undefined>): Promise<${SERVICES_TYPE}> => {`,
    `  const services: ${SERVICES_TYPE} = {}`,
    ...lines,
    `  return services`,
    `}`,
    ``,
  ].join('\n')
}
