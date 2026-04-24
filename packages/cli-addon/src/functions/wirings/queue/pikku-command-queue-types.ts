import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueTypes } from './serialize-queue-types.js'

export const pikkuQueueTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { queueTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      queueTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeQueueTypes(functionTypesImportPath)
    await writeFileInDir(logger, queueTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating queue types',
      commandEnd: 'Created queue types',
    }),
  ],
})
