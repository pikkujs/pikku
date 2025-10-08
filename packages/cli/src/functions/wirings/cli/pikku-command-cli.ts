import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuCLI: unknown = pikkuSessionlessFunc<void, true | undefined>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
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

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding CLI commands',
      commandEnd: 'Found CLI commands',
      skipCondition: false,
      skipMessage: 'none found',
    }),
  ],
})
