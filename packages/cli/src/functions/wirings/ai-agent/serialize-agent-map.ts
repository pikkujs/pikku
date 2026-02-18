import type { AIAgentMeta } from '@pikku/core/ai-agent'
import { serializeImportMap } from '../../../utils/serialize-import-map.js'
import { type TypesMap, generateCustomTypes } from '@pikku/inspector'
import { Logger } from '@pikku/core/services'

export const serializeAgentMap = (
  logger: Logger,
  relativeToPath: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap,
  agentsMeta: AIAgentMeta
) => {
  const requiredTypes = new Set<string>()

  const serializedAgents = generateAgents(agentsMeta, typesMap, requiredTypes)

  const hasAny = Object.keys(agentsMeta).length > 0
  const serializedCustomTypes = hasAny
    ? generateCustomTypes(typesMap, requiredTypes)
    : ''

  const serializedImportMap = hasAny
    ? serializeImportMap(
        logger,
        relativeToPath,
        packageMappings,
        typesMap,
        requiredTypes
      )
    : ''

  return `/**
 * Agent type map with output types for each agent
 */

${serializedImportMap}
${serializedCustomTypes}

interface AgentHandler<O> {
    output: O;
}

${serializedAgents}
`
}

function generateAgents(
  agentsMeta: AIAgentMeta,
  typesMap: TypesMap,
  requiredTypes: Set<string>
) {
  const agentsObj: Record<string, { outputType: string }> = {}

  for (const [agentName, meta] of Object.entries(agentsMeta)) {
    let outputType = 'string'
    if (meta.outputSchema) {
      try {
        outputType = typesMap.getTypeMeta(meta.outputSchema).uniqueName
      } catch {
        outputType = meta.outputSchema
      }
      requiredTypes.add(outputType)
    }
    agentsObj[agentName] = { outputType }
  }

  let agentsStr = 'export type AgentMap = {\n'
  for (const [agentName, handler] of Object.entries(agentsObj)) {
    agentsStr += `  readonly '${agentName}': AgentHandler<${handler.outputType}>,\n`
  }
  agentsStr += '};'

  return agentsStr
}
