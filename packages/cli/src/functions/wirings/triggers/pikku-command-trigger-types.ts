import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { singletonServicesTypeRef } from '../../../utils/singleton-services-type-ref.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTriggerTypes } from './serialize-trigger-types.js'

export const pikkuTriggerTypes = pikkuSessionlessFunc<
  { bootstrap?: boolean },
  void
>({
  func: async ({ logger, config, getInspectorState }, data) => {
    const { triggersTypesFile } = config
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
      triggersTypesFile
    )

    const content = serializeTriggerTypes(services.import, services.name, {
      addon: !!config.addon,
    })
    await writeFileInDir(logger, triggersTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating trigger types',
      commandEnd: 'Created trigger types',
    }),
  ],
})
