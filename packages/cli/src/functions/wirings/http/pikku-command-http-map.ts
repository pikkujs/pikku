import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTypedHTTPWiringsMap } from './serialize-typed-http-map.js'

export const pikkuHTTPMap: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const { http, functions } = await getInspectorState()
    const { httpMapDeclarationFile, packageMappings } = cliConfig

    const content = serializeTypedHTTPWiringsMap(
      httpMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      http.meta,
      http.metaInputTypes
    )
    await writeFileInDir(logger, httpMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating HTTP map',
      commandEnd: 'Created HTTP map',
      skipCondition: async ({ getInspectorState }) => {
        const { http } = await getInspectorState()
        return http.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
