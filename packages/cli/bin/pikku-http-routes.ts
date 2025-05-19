import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils/utils.js'

export const pikkuHTTP = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding HTTP routes',
    'Found HTTP routes',
    [visitState.http.files.size === 0],
    async () => {
      const { httpRoutesFile, httpRoutesMetaFile, packageMappings } = cliConfig
      const { http } = visitState
      await writeFileInDir(
        httpRoutesFile,
        serializeFileImports(
          'addHTTPRoute',
          httpRoutesFile,
          http.files,
          packageMappings
        )
      )
      await writeFileInDir(
        httpRoutesMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
      )
    }
  )
}
