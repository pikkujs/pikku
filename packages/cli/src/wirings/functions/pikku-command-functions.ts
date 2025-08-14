import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommand } from '../../types.js'
import { serializeFunctionImports } from './pikku-functions.js'

export const pikkuFunctions: PikkuCommand = async (
  logger,
  { functionsMetaFile, functionsFile, packageMappings },
  { functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Serializing Pikku functions',
    'Serialized Pikku functions',
    [false],
    async () => {
      await writeFileInDir(
        logger,
        functionsFile,
        serializeFunctionImports(
          functionsFile,
          functions.files,
          packageMappings
        )
      )
      await writeFileInDir(
        logger,
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )
    }
  )
}
