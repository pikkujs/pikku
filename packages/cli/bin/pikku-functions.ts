import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, writeFileInDir } from '../src/utils/utils.js'

export const pikkuFunctions = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding Pikku functions',
    'Found Pikku functions',
    [true],
    async () => {
      const { functionsMetaFile } = cliConfig
      const { functions } = visitState
      await writeFileInDir(
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )
    }
  )
}
