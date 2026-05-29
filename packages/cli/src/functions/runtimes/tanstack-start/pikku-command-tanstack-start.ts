import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTanStackStartShim } from './serialize-tanstack-start-shim.js'

export const pikkuTanStackStart = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const startServerFnsFile = config.clientFiles?.startServerFnsFile
    const rpcWiringsFile = config.clientFiles?.rpcWiringsFile
    const { packageMappings } = config

    if (!startServerFnsFile) {
      logger.debug({
        message:
          "Skipping generating TanStack Start shim since startServerFnsFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    if (!rpcWiringsFile) {
      logger.warn(
        "Skipping TanStack Start shim: startServerFnsFile is set but rpcWiringsFile is not — the shim imports the PikkuRPC class from rpcWiringsFile."
      )
      return
    }

    const rpcWiringsPath = getFileImportRelativePath(
      startServerFnsFile,
      rpcWiringsFile,
      packageMappings
    )

    const content = serializeTanStackStartShim(rpcWiringsPath)
    await writeFileInDir(logger, startServerFnsFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating TanStack Start shim',
      commandEnd: 'Generated TanStack Start shim',
    }),
  ],
})
