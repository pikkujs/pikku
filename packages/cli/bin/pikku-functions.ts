import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'

export const pikkuFunctions = async (
  { functionsMetaFile }: PikkuCLIConfig,
  { functions }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Serializing Pikku functions',
    'Serialized Pikku functions',
    [false],
    async () => {
      await writeFileInDir(
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )
    }
  )
}
