import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedHTTPWiringsMap } from './serialize-typed-http-map.js'

export const pikkuHTTPMap = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { http, functions, resolvedIOTypes } = await getInspectorState()
    const { httpMapDeclarationFile, packageMappings } = config

    const content = serializeTypedHTTPWiringsMap(
      logger,
      httpMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      http.meta,
      http.metaInputTypes,
      resolvedIOTypes
    )
    await writeFileInDir(logger, httpMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating HTTP map',
      commandEnd: 'Created HTTP map',
    }),
  ],
})
