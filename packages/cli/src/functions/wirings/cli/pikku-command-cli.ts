import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuCLI = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      cliWiringsFile,
      cliWiringMetaFile,
      cliWiringMetaJsonFile,
      cliContractsMetaJsonFile,
      cliContractsMetaFile,
      packageMappings,
      schema,
    } = config
    const { cli, exportedContracts } = visitState
    const hasCLIContracts = Object.keys(exportedContracts.cli).length > 0

    if (
      (cli.files.size === 0 || Object.keys(cli.meta).length === 0) &&
      !hasCLIContracts
    ) {
      return undefined
    }

    if (cli.files.size > 0 && Object.keys(cli.meta).length > 0) {
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
    }

    if (Object.keys(cli.meta).length > 0) {
      const minimalMeta = stripVerboseFields(cli.meta)
      await writeFileInDir(
        logger,
        cliWiringMetaJsonFile,
        JSON.stringify(minimalMeta, null, 2)
      )

      if (hasVerboseFields(cli.meta)) {
        const verbosePath = cliWiringMetaJsonFile.replace(
          /\.gen\.json$/,
          '-verbose.gen.json'
        )
        await writeFileInDir(
          logger,
          verbosePath,
          JSON.stringify(cli.meta, null, 2)
        )
      }
    }

    await writeFileInDir(
      logger,
      cliContractsMetaJsonFile,
      JSON.stringify(exportedContracts.cli, null, 2)
    )

    if (hasCLIContracts) {
      const contractsJsonImportPath = getFileImportRelativePath(
        cliContractsMetaFile,
        cliContractsMetaJsonFile,
        packageMappings
      )
      const supportsImportAttributes = schema?.supportsImportAttributes ?? false
      const contractsImportStatement = supportsImportAttributes
        ? `import contractsMeta from '${contractsJsonImportPath}' with { type: 'json' }`
        : `import contractsMeta from '${contractsJsonImportPath}'`

      await writeFileInDir(
        logger,
        cliContractsMetaFile,
        `${contractsImportStatement}\nexport default contractsMeta`
      )
    }

    if (Object.keys(cli.meta).length > 0) {
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
        `import { pikkuState } from '@pikku/core/internal'\nimport { CLIMeta } from '@pikku/core/cli'\n${importStatement}\npikkuState(null, 'cli', 'meta', metaData as CLIMeta)`
      )
    }

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding CLI commands',
      commandEnd: 'Found CLI commands',
    }),
  ],
})
