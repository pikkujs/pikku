import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  getFileImportRelativePath,
  writeFileInDir,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueWrapper } from './serialize-queue-wrapper.js'

export const pikkuQueueService = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { queueWiringsFile, queueMapDeclarationFile, packageMappings } =
      cliConfig

    if (!queueWiringsFile) {
      throw new Error("queueWiringsFile is isn't set in the pikku config")
    }

    const queueMapDeclarationPath = getFileImportRelativePath(
      queueWiringsFile,
      queueMapDeclarationFile,
      packageMappings
    )

    const content = [serializeQueueWrapper(queueMapDeclarationPath)]
    await writeFileInDir(logger, queueWiringsFile, content.join('\n'))
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating queue service wrapper',
      commandEnd: 'Generated queue service wrapper',
      skipCondition: ({ cliConfig }) =>
        cliConfig.queueWiringsFile === undefined,
      skipMessage: "queueWiringsFile isn't set in the pikku config",
    }),
  ],
})
