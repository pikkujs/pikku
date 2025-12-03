import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuHTTP: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      httpWiringsFile,
      httpWiringMetaFile,
      httpWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
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

    // Write minimal JSON (runtime-only fields)
    const minimalMeta = stripVerboseFields(http.meta)
    await writeFileInDir(
      logger,
      httpWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
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

    // Generate TypeScript file that imports the minimal JSON
    const jsonImportPath = getFileImportRelativePath(
      httpWiringMetaFile,
      httpWiringMetaJsonFile,
      packageMappings
    )
    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    await writeFileInDir(
      logger,
      httpWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\nimport type { HTTPWiringsMeta } from '@pikku/core/http'\n${importStatement}\npikkuState(null, 'http', 'meta', metaData as HTTPWiringsMeta)`
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding HTTP routes',
      commandEnd: 'Found HTTP routes',
    }),
  ],
})
