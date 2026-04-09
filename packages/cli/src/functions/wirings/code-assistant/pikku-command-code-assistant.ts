import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCodeAssistant } from './serialize-code-assistant.js'

export const pikkuCodeAssistant = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.codeAssistant) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.codeAssistantFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.codeAssistantFile,
        serializeCodeAssistant(
          pathToPikkuTypes,
          config.scaffold.codeAssistant === 'auth'
        )
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Code Assistant wiring',
      commandEnd: 'Generated Code Assistant wiring',
    }),
  ],
})
