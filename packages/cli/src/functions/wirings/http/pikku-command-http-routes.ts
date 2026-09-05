import { pikkuSessionlessFunc } from '#pikku/function'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeWiringMeta } from '../../../utils/write-wiring-meta.js'

export const pikkuCommandHTTP = pikkuSessionlessFunc<void, boolean | undefined>(
  {
    func: async ({ logger, config, getInspectorState }) => {
      const visitState = await getInspectorState()
      const {
        httpWiringsFile,
        httpWiringMetaFile,
        httpWiringMetaJsonFile,
        httpContractsMetaJsonFile,
        httpContractsMetaFile,
        packageMappings,
        schema,
      } = config
      const { http, exportedContracts } = visitState
      const hasHTTPContracts = Object.keys(exportedContracts.http).length > 0

      if (
        (http.files.size === 0 || Object.keys(http.meta).length === 0) &&
        !hasHTTPContracts
      ) {
        return undefined
      }

      // The bootstrap imports httpWiringsFile and httpWiringMetaFile whenever
      // this command reports HTTP as active (truthy return), so both must
      // always be written once past the guard above — including the
      // contracts-only or synthetic-route case where there are no local
      // wireHTTP source files (http.files is empty). Skipping either leaves the
      // bootstrap importing a file that was never generated and the per-unit
      // deploy bundle fails to resolve it.
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
        httpContractsMetaJsonFile,
        JSON.stringify(exportedContracts.http, null, 2)
      )

      if (hasHTTPContracts) {
        const contractsJsonImportPath = getFileImportRelativePath(
          httpContractsMetaFile,
          httpContractsMetaJsonFile,
          packageMappings
        )
        const supportsImportAttributes =
          schema?.supportsImportAttributes ?? false
        const contractsImportStatement = supportsImportAttributes
          ? `import contractsMeta from '${contractsJsonImportPath}' with { type: 'json' }`
          : `import contractsMeta from '${contractsJsonImportPath}'`

        await writeFileInDir(
          logger,
          httpContractsMetaFile,
          `${contractsImportStatement}\nexport default contractsMeta`
        )
      }

      await writeWiringMeta({
        logger,
        meta: http.meta,
        metaJsonFile: httpWiringMetaJsonFile,
        metaFile: httpWiringMetaFile,
        packageMappings,
        supportsImportAttributes: schema?.supportsImportAttributes ?? false,
        serializeMetaTS: ({ importStatement }) =>
          `import { pikkuState } from '@pikku/core/state'\nimport type { HTTPWiringsMeta } from '@pikku/core/http'\n${importStatement}\npikkuState(null, 'http', 'meta', metaData as HTTPWiringsMeta)`,
      })

      return true
    },
    middleware: [
      logCommandInfoAndTime({
        commandStart: 'Finding HTTP routes',
        commandEnd: 'Found HTTP routes',
      }),
    ],
  }
)
