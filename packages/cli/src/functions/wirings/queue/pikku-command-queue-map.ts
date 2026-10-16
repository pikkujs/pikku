import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMap } from './serialize-queue-map.js'
import { writeCustomTypesFile } from '../../../utils/custom-types-file.js'

export const pikkuCommandQueueMap = pikkuSessionlessFunc<void, void>({
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
      resolvedIOTypes,
      config.customTypesDeclarationFile
    )
    await writeCustomTypesFile(
      logger,
      config.customTypesDeclarationFile,
      packageMappings,
      functions.typesMap
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
