import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCLITypes } from './serialize-cli-types.js'

export const pikkuCLITypes: unknown = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { cliTypesFile, functionTypesFile, packageMappings } = cliConfig

    const functionTypesImportPath = getFileImportRelativePath(
      cliTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeCLITypes(functionTypesImportPath)
    await writeFileInDir(logger, cliTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating CLI types',
      commandEnd: 'Created CLI types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
