import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import {
  writeFileInDir,
  getFileImportRelativePath,
} from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeHTTPTypes } from './serialize-http-types.js'

export const pikkuHTTPTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { httpTypesFile, functionTypesFile, packageMappings } = cliConfig

    const functionTypesImportPath = getFileImportRelativePath(
      httpTypesFile,
      functionTypesFile,
      packageMappings
    )
    const content = serializeHTTPTypes(functionTypesImportPath)
    await writeFileInDir(logger, httpTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating HTTP types',
      commandEnd: 'Created HTTP types',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
