import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeTypedHTTPWiringsMap } from './serialize-typed-http-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuHTTPMap: PikkuCommand = async (
  logger,
  { httpMapDeclarationFile, packageMappings },
  { http, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating HTTP map',
    'Created HTTP map',
    [http.files.size === 0],
    async () => {
      const content = serializeTypedHTTPWiringsMap(
        httpMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        http.meta,
        http.metaInputTypes
      )
      await writeFileInDir(logger, httpMapDeclarationFile, content)
    }
  )
}
