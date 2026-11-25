import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { singletonServicesTypeRef } from '../../../providers/provider-types-source.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeGatewayTypes } from './serialize-gateway-types.js'

export const pikkuGatewayTypes = pikkuSessionlessFunc<
  { bootstrap?: boolean },
  void
>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { gatewaysTypesFile } = config
    const visitState = await getInspectorState(
      false,
      true,
      data?.bootstrap ?? false
    )

    const { singletonServicesType } = visitState.filesAndMethods

    if (!singletonServicesType) {
      throw new Error('SingletonServices type not found')
    }

    const services = singletonServicesTypeRef(
      visitState,
      config,
      gatewaysTypesFile
    )

    const content = serializeGatewayTypes(services.import, services.name, {
      addon: !!config.addon,
    })
    await writeFileInDir(logger, gatewaysTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating gateway types',
      commandEnd: 'Created gateway types',
    }),
  ],
})
