import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  writeFileInDir,
  getFileImportRelativePath,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueTypes } from './serialize-queue-types.js'

export const pikkuQueueTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { queueTypesFile, functionTypesFile, packageMappings } = cliConfig

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
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
