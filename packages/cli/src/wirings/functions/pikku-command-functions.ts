import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { PikkuCommand } from '../../types.js'
import {
  generateRuntimeMeta,
  serializeFunctionImports,
} from './serialize-function-imports.js'

export const pikkuFunctions: PikkuCommand = async (
  logger,
  { functionsMetaFile, functionsMetaMinFile, functionsFile, packageMappings },
  { functions, rpc }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Serializing Pikku functions',
    'Serialized Pikku functions',
    [false],
    async () => {
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

      if (rpc.exposedFiles.size > 0 || rpc.internalFiles.size > 0) {
        await writeFileInDir(
          logger,
          functionsFile,
          serializeFunctionImports(
            functionsFile,
            rpc.internalFiles,
            functions.meta,
            packageMappings
          )
        )
      }
    }
  )
}
