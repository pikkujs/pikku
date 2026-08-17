import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeHTTPTypes } from './serialize-http-types.js'

export const pikkuHTTPTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const {
      httpTypesFile,
      functionTypesFile,
      middlewareTypesFile,
      packageMappings,
    } = config

    const functionTypesImportPath = getFileImportRelativePath(
      httpTypesFile,
      functionTypesFile,
      packageMappings
    )
    const middlewareTypesImportPath = getFileImportRelativePath(
      httpTypesFile,
      middlewareTypesFile,
      packageMappings
    )
    const authTypesImportPath = getFileImportRelativePath(
      httpTypesFile,
      config.authGuardsFile,
      packageMappings
    )
    const content = serializeHTTPTypes(
      functionTypesImportPath,
      middlewareTypesImportPath,
      authTypesImportPath,
      {
        addon: !!config.addon,
      }
    )
    await writeFileInDir(logger, httpTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating HTTP types',
      commandEnd: 'Created HTTP types',
    }),
  ],
})
