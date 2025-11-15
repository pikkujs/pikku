import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  generateRuntimeMeta,
  serializeFunctionImports,
} from './serialize-function-imports.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuFunctions: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      functionsMetaFile,
      functionsMetaJsonFile,
      functionsMetaVerboseFile,
      functionsMetaVerboseJsonFile,
      functionsMetaMinFile,
      functionsMetaMinJsonFile,
      functionsFile,
      packageMappings,
      schema,
    } = config

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateRuntimeMeta(functions.meta)

    await writeFileInDir(
      logger,
      functionsMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    const runtimeJsonImportPath = getFileImportRelativePath(
      functionsMetaFile,
      functionsMetaJsonFile,
      packageMappings
    )

    const runtimeImportStatement = supportsImportAttributes
      ? `import metaData from '${runtimeJsonImportPath}' with { type: 'json' }`
      : `import metaData from '${runtimeJsonImportPath}'`

    await writeFileInDir(
      logger,
      functionsMetaFile,
      `import { pikkuState, FunctionsRuntimeMeta } from '@pikku/core'\n${runtimeImportStatement}\npikkuState('function', 'meta', metaData as FunctionsRuntimeMeta)`
    )

    await writeFileInDir(
      logger,
      functionsMetaVerboseJsonFile,
      JSON.stringify(functions.meta, null, 2)
    )

    const verboseJsonImportPath = getFileImportRelativePath(
      functionsMetaVerboseFile,
      functionsMetaVerboseJsonFile,
      packageMappings
    )

    const verboseImportStatement = supportsImportAttributes
      ? `import metaData from '${verboseJsonImportPath}' with { type: 'json' }`
      : `import metaData from '${verboseJsonImportPath}'`

    await writeFileInDir(
      logger,
      functionsMetaVerboseFile,
      `import { pikkuState, FunctionsMeta } from '@pikku/core'\n${verboseImportStatement}\npikkuState('function', 'meta', metaData as FunctionsMeta)`
    )

    await writeFileInDir(
      logger,
      functionsMetaMinJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    const minJsonImportPath = getFileImportRelativePath(
      functionsMetaMinFile,
      functionsMetaMinJsonFile,
      packageMappings
    )

    const minImportStatement = supportsImportAttributes
      ? `import metaData from '${minJsonImportPath}' with { type: 'json' }`
      : `import metaData from '${minJsonImportPath}'`

    await writeFileInDir(
      logger,
      functionsMetaMinFile,
      `import { pikkuState, FunctionsRuntimeMeta } from '@pikku/core'\n${minImportStatement}\npikkuState('function', 'meta', metaData as FunctionsRuntimeMeta)`
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
