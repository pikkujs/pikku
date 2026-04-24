import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeTriggerTypes } from './serialize-trigger-types.js'

export const pikkuTriggerTypes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { triggersTypesFile, packageMappings } = config
    const visitState = await getInspectorState()

    const { singletonServicesType } = visitState.filesAndMethods

    if (!singletonServicesType) {
      throw new Error('SingletonServices type not found')
    }

    const singletonServicesTypeImport = `import type { ${singletonServicesType.type} } from '${getFileImportRelativePath(triggersTypesFile, singletonServicesType.typePath, packageMappings)}'`

    const content = serializeTriggerTypes(
      singletonServicesTypeImport,
      singletonServicesType.type
    )
    await writeFileInDir(logger, triggersTypesFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating trigger types',
      commandEnd: 'Created trigger types',
    }),
  ],
})
