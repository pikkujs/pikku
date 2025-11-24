import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuHTTP: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { httpWiringsFile, httpWiringMetaFile, packageMappings } = config
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
      `import { pikkuState } from '@pikku/core'\npikkuState(null, 'http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
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
