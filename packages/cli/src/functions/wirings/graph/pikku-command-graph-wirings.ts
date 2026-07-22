import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeGraphWirings } from './serialize-graph-wirings.js'

export const pikkuGraphWirings = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.graph && config.graphWiringsFile) {
      const pathToPikkuTypes = getFileImportRelativePath(
        config.graphWiringsFile,
        config.typesDeclarationFile,
        config.packageMappings
      )
      await writeFileInDir(
        logger,
        config.graphWiringsFile,
        serializeGraphWirings(pathToPikkuTypes)
      )
      await removeLegacyScaffoldFile(config.graphWiringsFile)
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Graph Wirings',
      commandEnd: 'Generated Graph Wirings',
    }),
  ],
})
