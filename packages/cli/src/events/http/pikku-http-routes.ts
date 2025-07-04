import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuHTTP: PikkuCommand = async (
  logger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding HTTP routes',
    'Found HTTP routes',
    [visitState.http.files.size === 0],
    async () => {
      const { httpRoutesFile, httpRoutesMetaFile, packageMappings } = cliConfig
      const { http } = visitState
      await writeFileInDir(
        logger,
        httpRoutesFile,
        serializeFileImports(
          'addHTTPRoute',
          httpRoutesFile,
          http.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        httpRoutesMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
      )
    }
  )
}
