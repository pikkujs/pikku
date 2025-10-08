import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeHTTPTypes } from './serialize-http-types.js'

export const pikkuHTTPTypes: unknown = pikkuSessionlessFunc<void, void>({
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
