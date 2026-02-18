import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializePublicAgent } from './serialize-public-agent.js'
import { join } from 'path'

export const pikkuPublicAgent = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.agent?.publicAgentPath) {
      const publicAgentPath = join(config.rootDir, config.agent.publicAgentPath)
      const pathToPikkuTypes = getFileImportRelativePath(
        publicAgentPath,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        publicAgentPath,
        serializePublicAgent(
          pathToPikkuTypes,
          config.agent.publicAgentRequireAuth ?? true
        )
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
