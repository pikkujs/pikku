import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommand } from '../../types.js'
import {
  serializeFunctionImports,
  generateRuntimeMeta,
} from './pikku-functions.js'

export const pikkuFunctions: PikkuCommand = async (
  logger,
  { functionsMetaFile, functionsMetaMinFile, functionsFile, packageMappings },
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
          functions.meta,
          packageMappings
        )
      )
      // Generate full metadata
      await writeFileInDir(
        logger,
        functionsMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      )

      // Generate minimal metadata (runtime)
      const runtimeMeta = generateRuntimeMeta(functions.meta)
      await writeFileInDir(
        logger,
        functionsMetaMinFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('function', 'meta', ${JSON.stringify(runtimeMeta, null, 2)})`
      )
    }
  )
}
