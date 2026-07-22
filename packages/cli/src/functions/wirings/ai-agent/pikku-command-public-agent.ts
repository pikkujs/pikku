import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializePublicAgent } from './serialize-public-agent.js'

export const pikkuPublicAgent = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.agent && config.publicAgentSchemasFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.publicAgentFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const { schemas, functions } = serializePublicAgent(
        pathToPikkuTypes,
        config.scaffold.agent === 'auth',
        config.globalHTTPPrefix || ''
      )
      await writeFileInDir(logger, config.publicAgentSchemasFile, schemas)
      await writeFileInDir(logger, config.publicAgentFile, functions)
      await removeLegacyScaffoldFile(config.publicAgentFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Public Agent Endpoint',
      commandEnd: 'Generated Public Agent Endpoint',
    }),
  ],
})
