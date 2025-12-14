import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTriggerTypes } from './serialize-trigger-types.js'

export const pikkuTriggerTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { triggersTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      triggersTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeTriggerTypes(functionTypesImportPath)
    await writeFileInDir(logger, triggersTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating trigger types',
      commandEnd: 'Created trigger types',
    }),
  ],
})
