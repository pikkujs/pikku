import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports, writeFileInDir } from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuHTTP = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { httpWiringsFile, httpWiringMetaFile, packageMappings } = cliConfig
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
      httpWiringMetaFile,
      `import { pikkuState } from '@pikku/core'\npikkuState('http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding HTTP routes',
      commandEnd: 'Found HTTP routes',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.http.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
