import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeDynamicAgents } from './serialize-dynamic-agents.js'

export const pikkuDynamicAgents = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.dynamicAgents) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.dynamicAgentsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.dynamicAgentsFile,
        serializeDynamicAgents(
          pathToPikkuTypes,
          config.scaffold.dynamicAgents === 'auth'
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Dynamic Agents wiring',
      commandEnd: 'Generated Dynamic Agents wiring',
    }),
  ],
})
