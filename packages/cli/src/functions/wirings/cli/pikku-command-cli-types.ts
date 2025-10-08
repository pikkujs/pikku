import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  writeFileInDir,
  getFileImportRelativePath,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeCLITypes } from './serialize-cli-types.js'

export const pikkuCLITypes = pikkuSessionlessFunc<void, void>({
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
