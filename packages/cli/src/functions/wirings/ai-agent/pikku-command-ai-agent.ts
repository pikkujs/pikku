import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuAIAgent = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { agents } = await getInspectorState()
    const {
      agentWiringsFile,
      agentWiringMetaFile,
      agentWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config

    await writeFileInDir(
      logger,
      agentWiringsFile,
      serializeFileImports(
        'wireAIAgent',
        agentWiringsFile,
        agents.files,
        packageMappings
      )
    )

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
      `import { pikkuState } from '@pikku/core'
import type { AIAgentMeta } from '@pikku/core/ai-agent'
${importStatement}
pikkuState(null, 'agent', 'agentsMeta', metaData.agentsMeta as AIAgentMeta)`
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
