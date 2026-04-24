import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'

export const pikkuGateway = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { gatewaysWiringFile, packageMappings } = config
    const { gateways } = visitState

    if (Object.keys(gateways.meta).length === 0) {
      return undefined
    }

    await writeFileInDir(
      logger,
      gatewaysWiringFile,
      serializeFileImports(
        'wireGateway',
        gatewaysWiringFile,
        gateways.files,
        packageMappings
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding gateways',
      commandEnd: 'Found gateways',
    }),
  ],
})
