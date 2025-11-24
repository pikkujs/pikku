import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuCLI: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      cliWiringsFile,
      cliWiringMetaFile,
      cliWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
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

    await writeFileInDir(
      logger,
      cliWiringMetaJsonFile,
      JSON.stringify(cli.meta, null, 2)
    )

    const jsonImportPath = getFileImportRelativePath(
      cliWiringMetaFile,
      cliWiringMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    await writeFileInDir(
      logger,
      cliWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\nimport { CLIMeta } from '@pikku/core/cli'\n${importStatement}\npikkuState(null, 'cli', 'meta', metaData as CLIMeta)`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding CLI commands',
      commandEnd: 'Found CLI commands',
    }),
  ],
})
