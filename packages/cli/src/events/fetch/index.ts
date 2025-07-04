import { serializeFetchWrapper } from '../http/serialize-fetch-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'

export const pikkuFetch: PikkuCommandWithoutState = async (
  logger,
  { fetchFile, httpRoutesMapDeclarationFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating fetch wrapper',
    'Generated fetch wrapper',
    [fetchFile === undefined, "fetchFile isn't set in the pikku config"],
    async () => {
      if (!fetchFile) {
        throw new Error("fetchFile is isn't set in the pikku config")
      }

      const routesMapDeclarationPath = getFileImportRelativePath(
        fetchFile,
        httpRoutesMapDeclarationFile,
        packageMappings
      )

      const content = [serializeFetchWrapper(routesMapDeclarationPath)]
      await writeFileInDir(logger, fetchFile, content.join('\n'))
    }
  )
}
