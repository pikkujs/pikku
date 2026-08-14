import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { serializeAgentMap } from './serialize-agent-map.js'
import { serializeModelAliases } from './serialize-model-aliases.js'

export const pikkuAgent = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { agents, functions } = await getInspectorState()
    const {
      agentWiringsFile,
      agentWiringMetaFile,
      agentWiringMetaJsonFile,
      agentMapDeclarationFile,
      modelAliasesFile,
      packageMappings,
      schema,
      addonName,
      models,
    } = config

    const agentFiles = agents.files as Map<
      string,
      { path: string; exportedName: string }
    >

    // Written even with no agents: the image/speech/embedding runner methods
    // take a model too.
    await writeFileInDir(
      logger,
      modelAliasesFile,
      serializeModelAliases(models, addonName ?? null)
    )

    if (agentFiles.size === 0 || Object.keys(agents.agentsMeta).length === 0) {
      // Still need to generate an empty agent map for the types import
      await writeFileInDir(
        logger,
        agentMapDeclarationFile,
        `export type AgentMap = {}\n`
      )
      return undefined
    }

    const lines: string[] = []

    lines.push(`import { addAgent } from '@pikku/core/ecosystem/agent'`)

    const metaImportPath = getFileImportRelativePath(
      agentWiringsFile,
      agentWiringMetaFile,
      packageMappings
    )
    if (Object.keys(agents.agentsMeta).length > 0) {
      lines.push(`import '${metaImportPath}'`)
    }

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

    const packageArg = addonName ? `, '${addonName}'` : ''
    for (const [agentName, { exportedName }] of sortedAgents) {
      lines.push(`addAgent('${agentName}', ${exportedName}${packageArg})`)
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

    await writeFileInDir(
      logger,
      agentWiringMetaFile,
      `import { pikkuState } from '@pikku/core/ecosystem'
import type { AgentsMeta } from '@pikku/core/ecosystem/agent'
${importStatement}
pikkuState(${addonName ? `'${addonName}'` : 'null'}, 'agent', 'agentsMeta', metaData.agentsMeta as AgentsMeta)`
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
