import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  generateRuntimeMeta,
  serializeFunctionImports,
} from './serialize-function-imports.js'

export const pikkuFunctions: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      functionsMetaFile,
      functionsMetaMinFile,
      functionsFile,
      packageMappings,
    } = config

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

    const hasRPCs = rpc.exposedFiles.size > 0 || rpc.internalFiles.size > 0
    if (hasRPCs) {
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

    return hasRPCs
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku functions',
      commandEnd: 'Serialized Pikku functions',
    }),
  ],
})
