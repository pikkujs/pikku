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
      const { httpWiringsFile, httpWiringMetaFile, packageMappings } = cliConfig
      const { http } = visitState
      await writeFileInDir(
        logger,
        httpWiringsFile,
        serializeFileImports(
          'wireHTTP',
          httpWiringsFile,
          http.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        httpWiringMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
      )
    }
  )
}
