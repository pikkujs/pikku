import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeGraphWirings } from './serialize-graph-wirings.js'

export const pikkuGraphWirings = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (config.scaffold?.graph && config.graphWiringsFile) {
      await writeFileInDir(
        logger,
        config.graphWiringsFile,
        serializeGraphWirings((leaf) =>
          getLeafImportPath(config.graphWiringsFile!, leaf, config)
        )
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
