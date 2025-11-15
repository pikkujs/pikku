import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

const generateHTTPRuntimeMeta = (meta: any) => {
  const runtimeMeta: any = {}

  for (const [method, routes] of Object.entries(meta)) {
    runtimeMeta[method] = {}
    for (const [route, routeMeta] of Object.entries(routes as any)) {
      const { summary, description, errors, inputTypes, ...runtime } =
        routeMeta as any
      runtimeMeta[method][route] = runtime
    }
  }

  return runtimeMeta
}

export const pikkuHTTP: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      httpWiringsFile,
      httpWiringMetaFile,
      httpWiringMetaJsonFile,
      httpWiringMetaVerboseFile,
      httpWiringMetaVerboseJsonFile,
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

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateHTTPRuntimeMeta(http.meta)

    await writeFileInDir(
      logger,
      httpWiringMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    const runtimeImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-http-wirings-meta.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-http-wirings-meta.gen.json'`

    await writeFileInDir(
      logger,
      httpWiringMetaFile,
      `import { pikkuState, HTTPWiringsMeta } from '@pikku/core'\n${runtimeImportStatement}\npikkuState('http', 'meta', metaData as HTTPWiringsMeta)`
    )

    if (config.verboseMeta) {
      await writeFileInDir(
        logger,
        httpWiringMetaVerboseJsonFile,
        JSON.stringify(http.meta, null, 2)
      )

      const verboseImportStatement = supportsImportAttributes
        ? `import metaData from './pikku-http-wirings-meta.verbose.gen.json' with { type: 'json' }`
        : `import metaData from './pikku-http-wirings-meta.verbose.gen.json'`

      await writeFileInDir(
        logger,
        httpWiringMetaVerboseFile,
        `import { pikkuState, HTTPWiringsMeta } from '@pikku/core'\n${verboseImportStatement}\npikkuState('http', 'meta', metaData as HTTPWiringsMeta)`
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
})
