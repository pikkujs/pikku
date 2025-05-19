import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'
import { serializeTypedRoutesMap } from '../src/serialize-typed-http-map.js'

export const pikkuHTTPMap = async (
  { httpRoutesMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  { http, functions }: InspectorState
) => {
  return await logCommandInfoAndTime(
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
      await writeFileInDir(httpRoutesMapDeclarationFile, content)
    }
  )
}
