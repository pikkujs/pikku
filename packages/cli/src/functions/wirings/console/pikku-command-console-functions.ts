import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeConsoleFunctions } from './serialize-console-functions.js'
import { join } from 'path'

export const pikkuConsoleFunctions = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.console?.functionsPath) {
      const consoleFunctionsPath = join(
        config.rootDir,
        config.console.functionsPath
      )
      const pathToPikkuTypes = getFileImportRelativePath(
        consoleFunctionsPath,
        config.typesDeclarationFile,
        config.packageMappings
      )
      const pathToAgentTypes = getFileImportRelativePath(
        consoleFunctionsPath,
        config.agentTypesFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        consoleFunctionsPath,
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
