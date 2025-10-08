import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFetchWrapper } from '../http/serialize-fetch-wrapper.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuFetch = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig }) => {
    const { fetchFile, httpMapDeclarationFile, packageMappings } = cliConfig

    if (!fetchFile) {
      throw new Error("fetchFile is isn't set in the pikku config")
    }

    const routesMapDeclarationPath = getFileImportRelativePath(
      fetchFile,
      httpMapDeclarationFile,
      packageMappings
    )

    const content = [serializeFetchWrapper(routesMapDeclarationPath)]
    await writeFileInDir(logger, fetchFile, content.join('\n'))
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating fetch wrapper',
      commandEnd: 'Generated fetch wrapper',
      skipCondition: ({ cliConfig }) => cliConfig.fetchFile === undefined,
      skipMessage: "fetchFile isn't set in the pikku config",
    }),
  ],
})
