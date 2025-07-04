import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeTypedRoutesMap } from './serialize-typed-http-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuHTTPMap: PikkuCommand = async (
  logger,
  { httpRoutesMapDeclarationFile, packageMappings },
  { http, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating HTTP map',
    'Created HTTP map',
    [http.files.size === 0],
    async () => {
      const content = serializeTypedRoutesMap(
        httpRoutesMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        http.meta,
        http.metaInputTypes
      )
      await writeFileInDir(logger, httpRoutesMapDeclarationFile, content)
    }
  )
}
