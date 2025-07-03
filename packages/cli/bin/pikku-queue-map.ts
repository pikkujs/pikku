import { InspectorState } from '@pikku/inspector'
import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'
import { serializeQueueMap } from '../src/serialize-queue-map.js'

export const pikkuQueueMap = async (
  { queueMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  { queueWorkers, functions }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Creating Queue map',
    'Created Queue map',
    [queueWorkers.files.size === 0],
    async () => {
      const content = serializeQueueMap(
        queueMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        queueWorkers.meta
      )
      await writeFileInDir(queueMapDeclarationFile, content)
    }
  )
}
