import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeAgentTypes } from './serialize-agent-types.js'

export const pikkuAgentTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      agentTypesFile,
      functionTypesFile,
      agentMapDeclarationFile,
      scorerNamesDeclarationFile,
      scopesFile,
      packageMappings,
    } = config

    const functionTypesImportPath = getFileImportRelativePath(
      agentTypesFile,
      functionTypesFile,
      packageMappings
    )
    const agentMapImportPath = getFileImportRelativePath(
      agentTypesFile,
      agentMapDeclarationFile,
      packageMappings
    )
    const scopesImportPath = getFileImportRelativePath(
      agentTypesFile,
      scopesFile,
      packageMappings
    )
    const scorerNamesImportPath = getFileImportRelativePath(
      agentTypesFile,
      scorerNamesDeclarationFile,
      packageMappings
    )
    const middlewareTypesImportPath = getFileImportRelativePath(
      agentTypesFile,
      config.middlewareTypesFile,
      packageMappings
    )
    const content = serializeAgentTypes(
      functionTypesImportPath,
      middlewareTypesImportPath,
      getFileImportRelativePath(
        agentTypesFile,
        config.authGuardsFile,
        packageMappings
      ),
      agentMapImportPath,
      scopesImportPath,
      scorerNamesImportPath
    )
    await writeFileInDir(logger, agentTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating AI agent types',
      commandEnd: 'Created AI agent types',
    }),
  ],
})
