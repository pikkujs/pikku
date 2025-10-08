import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMap } from './serialize-queue-map.js'

export const pikkuQueueMap: unknown = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const { queueWorkers, functions } = await getInspectorState()
    const { queueMapDeclarationFile, packageMappings } = cliConfig

    const content = serializeQueueMap(
      queueMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      functions.meta,
      queueWorkers.meta
    )
    await writeFileInDir(logger, queueMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Queue map',
      commandEnd: 'Created Queue map',
      skipCondition: async ({ getInspectorState }) => {
        const { queueWorkers } = await getInspectorState()
        return queueWorkers.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
