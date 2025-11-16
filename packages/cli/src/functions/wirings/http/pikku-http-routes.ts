import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuHTTP: any = pikkuSessionlessFunc<void, boolean>({
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

    await writeFileInDir(
      logger,
      httpWiringMetaJsonFile,
      JSON.stringify(http.meta, null, 2)
    )

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
      `import { pikkuState, HTTPWiringsMeta } from '@pikku/core'\n${importStatement}\npikkuState('http', 'meta', metaData as HTTPWiringsMeta)`
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
