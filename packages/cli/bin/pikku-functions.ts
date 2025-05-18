import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils.js'

export const pikkuFunctions = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding Pikku functions',
    'Found Pikku functions',
    [visitState.functions.files.size === 0],
    async () => {
      const { functionsFile, functionsMetaFile, packageMappings } = cliConfig
      const { functions } = visitState
      await writeFileInDir(
        functionsFile,
        serializeFileImports(
          'addFunction',
          functionsFile,
          functions.files,
          packageMappings
        )
      )
      await writeFileInDir(
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )
    }
  )
}
