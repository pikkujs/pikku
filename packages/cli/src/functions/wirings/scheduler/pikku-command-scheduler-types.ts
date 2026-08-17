import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSchedulerTypes } from './serialize-scheduler-types.js'

export const pikkuSchedulerTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { schedulersTypesFile, functionTypesFile, packageMappings } = config

    const functionTypesImportPath = getFileImportRelativePath(
      schedulersTypesFile,
      functionTypesFile,
      packageMappings
    )
    const middlewareTypesImportPath = getFileImportRelativePath(
      schedulersTypesFile,
      config.middlewareTypesFile,
      packageMappings
    )
    const content = serializeSchedulerTypes(
      functionTypesImportPath,
      middlewareTypesImportPath,
      {
        addon: !!config.addon,
      }
    )
    await writeFileInDir(logger, schedulersTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating cheduler types',
      commandEnd: 'Created scheduler types',
    }),
  ],
})
