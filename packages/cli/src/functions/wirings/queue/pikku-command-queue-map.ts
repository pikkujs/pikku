import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMap } from './serialize-queue-map.js'

export const pikkuQueueMap = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { queueWorkers, functions, resolvedIOTypes } =
      await getInspectorState()
    const { queueMapDeclarationFile, packageMappings } = config

    const content = serializeQueueMap(
      logger,
      queueMapDeclarationFile,
      packageMappings,
      functions.typesMap,
      queueWorkers.meta,
      resolvedIOTypes
    )
    await writeFileInDir(logger, queueMapDeclarationFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating Queue map',
      commandEnd: 'Created Queue map',
    }),
  ],
})
