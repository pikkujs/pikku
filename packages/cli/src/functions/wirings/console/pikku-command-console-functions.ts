import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeConsoleFunctions } from './serialize-console-functions.js'

export const pikkuConsoleFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.console) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.consoleFunctionsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const pathToAgentTypes = getFileImportRelativePath(
        config.consoleFunctionsFile,
        config.agentTypesFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.consoleFunctionsFile,
        serializeConsoleFunctions(pathToPikkuTypes, pathToAgentTypes)
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Console functions',
      commandEnd: 'Generated Console functions',
    }),
  ],
})
