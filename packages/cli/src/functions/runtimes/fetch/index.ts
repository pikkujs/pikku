import { pikkuSessionlessFunc } from '#pikku'
import { serializeFetchWrapper } from '../../wirings/http/serialize-fetch-wrapper.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuFetch = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { fetchFile, httpMapDeclarationFile, packageMappings } = config

    // If fetchFile is not set, clean up any existing file and return
    if (!fetchFile) {
      logger.info({
        message:
          "Skipping generating fetch wrapper since fetchFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
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
    }),
  ],
})
