import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

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

      if (http.files.size > 0 && Object.keys(http.meta).length > 0) {
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
      }

      if (Object.keys(http.meta).length > 0) {
        const minimalMeta = stripVerboseFields(http.meta)
        await writeFileInDir(
          logger,
          httpWiringMetaJsonFile,
          JSON.stringify(minimalMeta, null, 2)
        )

        if (hasVerboseFields(http.meta)) {
          const verbosePath = httpWiringMetaJsonFile.replace(
            /\.gen\.json$/,
            '-verbose.gen.json'
          )
          await writeFileInDir(
            logger,
            verbosePath,
            JSON.stringify(http.meta, null, 2)
          )
        }
      }

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

      if (Object.keys(http.meta).length > 0) {
        const jsonImportPath = getFileImportRelativePath(
          httpWiringMetaFile,
          httpWiringMetaJsonFile,
          packageMappings
        )
        const supportsImportAttributes =
          schema?.supportsImportAttributes ?? false
        const importStatement = supportsImportAttributes
          ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
          : `import metaData from '${jsonImportPath}'`

        await writeFileInDir(
          logger,
          httpWiringMetaFile,
          `import { pikkuState } from '@pikku/core/internal'\nimport type { HTTPWiringsMeta } from '@pikku/core/http'\n${importStatement}\npikkuState(null, 'http', 'meta', metaData as HTTPWiringsMeta)`
        )
      }

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
