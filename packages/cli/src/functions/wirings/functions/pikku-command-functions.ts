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
      functionsMetaMinFile,
      functionsMetaMinJsonFile,
      functionsFile,
      packageMappings,
      schema,
    } = config

    await writeFileInDir(
      logger,
      functionsMetaJsonFile,
      JSON.stringify(functions.meta, null, 2)
    )

    const fullJsonImportPath = getFileImportRelativePath(
      functionsMetaFile,
      functionsMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const fullImportStatement = supportsImportAttributes
      ? `import metaData from '${fullJsonImportPath}' with { type: 'json' }`
      : `import metaData from '${fullJsonImportPath}'`

    await writeFileInDir(
      logger,
      functionsMetaFile,
      `import { pikkuState, FunctionsMeta } from '@pikku/core'\n${fullImportStatement}\npikkuState('function', 'meta', metaData as FunctionsMeta)`
    )

    const runtimeMeta = generateRuntimeMeta(functions.meta)
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
