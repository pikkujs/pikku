import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePublicAgent } from './serialize-public-agent.js'

export const pikkuPublicAgent = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.agent) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.publicAgentFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.publicAgentFile,
        serializePublicAgent(pathToPikkuTypes, config.scaffold.agent === 'auth')
      )
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
