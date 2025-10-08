import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSchedulerTypes } from './serialize-scheduler-types.js'

export const pikkuSchedulerTypes: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { schedulersTypesFile, functionTypesFile, packageMappings } =
      cliConfig

    const functionTypesImportPath = getFileImportRelativePath(
      schedulersTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeSchedulerTypes(functionTypesImportPath)
    await writeFileInDir(logger, schedulersTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating scheduler types',
      commandEnd: 'Created scheduler types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
