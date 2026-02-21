import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { serializeAgentMap } from './serialize-agent-map.js'

export const pikkuAIAgent = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { agents, functions } = await getInspectorState()
    const {
      agentWiringsFile,
      agentWiringMetaFile,
      agentWiringMetaJsonFile,
      agentMapDeclarationFile,
      packageMappings,
      schema,
      externalPackageName,
    } = config

    const lines: string[] = []
    const hasAgents = (agents.files as Map<string, unknown>).size > 0

    if (hasAgents) {
      lines.push(`import { addAIAgent } from '@pikku/core/ai-agent'`)
    }

    const metaImportPath = getFileImportRelativePath(
      agentWiringsFile,
      agentWiringMetaFile,
      packageMappings
    )
    if (Object.keys(agents.agentsMeta).length > 0) {
      lines.push(`import '${metaImportPath}'`)
    }

    const agentFiles = agents.files as Map<
      string,
      { path: string; exportedName: string }
    >
    const sortedAgents = Array.from(agentFiles.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    for (const [, { path, exportedName }] of sortedAgents) {
      const importPath = getFileImportRelativePath(
        agentWiringsFile,
        path,
        packageMappings
      )
      lines.push(`import { ${exportedName} } from '${importPath}'`)
    }

    lines.push('')

    const packageArg = externalPackageName ? `, '${externalPackageName}'` : ''
    for (const [agentName, { exportedName }] of sortedAgents) {
      lines.push(`addAIAgent('${agentName}', ${exportedName}${packageArg})`)
    }

    await writeFileInDir(logger, agentWiringsFile, lines.join('\n'))

    const metaData = {
      agentsMeta: agents.agentsMeta,
    }

    const minimalMeta = stripVerboseFields(metaData)
    await writeFileInDir(
      logger,
      agentWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    if (hasVerboseFields(metaData)) {
      const verbosePath = agentWiringMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(metaData, null, 2)
      )
    }

    const jsonImportPath = getFileImportRelativePath(
      agentWiringMetaFile,
      agentWiringMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    const modelConfigLines: string[] = []
    if (
      !externalPackageName &&
      (config.models || config.agentDefaults || config.agentOverrides)
    ) {
      modelConfigLines.push(
        `\npikkuState(null, 'models', 'config', ${JSON.stringify({
          models: config.models,
          agentDefaults: config.agentDefaults,
          agentOverrides: config.agentOverrides,
        })} as any)`
      )
    }

    await writeFileInDir(
      logger,
      agentWiringMetaFile,
      `import { pikkuState } from '@pikku/core'
import type { AIAgentMeta } from '@pikku/core/ai-agent'
${importStatement}
pikkuState(${externalPackageName ? `'${externalPackageName}'` : 'null'}, 'agent', 'agentsMeta', metaData.agentsMeta as AIAgentMeta)${modelConfigLines.join('')}`
    )

    await writeFileInDir(
      logger,
      agentMapDeclarationFile,
      serializeAgentMap(
        logger,
        agentMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        agents.agentsMeta
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding AI agents',
      commandEnd: 'Found AI agents',
    }),
  ],
})
