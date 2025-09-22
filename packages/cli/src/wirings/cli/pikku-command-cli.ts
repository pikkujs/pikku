import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuCLI: PikkuCommand = async (
  logger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding CLI commands',
    'Found CLI commands',
    [visitState.cli.files.size === 0],
    async () => {
      const { cliWiringsFile, cliWiringMetaFile, packageMappings } = cliConfig
      const { cli } = visitState

      // Generate CLI wirings file
      await writeFileInDir(
        logger,
        cliWiringsFile,
        serializeFileImports(
          'wireCLI',
          cliWiringsFile,
          cli.files,
          packageMappings
        )
      )

      // Generate CLI metadata file
      await writeFileInDir(
        logger,
        cliWiringMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('cli', 'meta', ${JSON.stringify(cli.meta, null, 2)})`
      )
    }
  )
}
