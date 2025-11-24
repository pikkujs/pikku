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

    const packageName = config.externalPackageName
      ? `'${config.externalPackageName}'`
      : 'null'

    await writeFileInDir(
      logger,
      functionsMetaFile,
      `import { pikkuState, FunctionsMeta } from '@pikku/core'\n${fullImportStatement}\npikkuState(${packageName}, 'function', 'meta', metaData as FunctionsMeta)`
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
      `import { pikkuState, FunctionsRuntimeMeta } from '@pikku/core'\n${minImportStatement}\npikkuState(${packageName}, 'function', 'meta', metaData as FunctionsRuntimeMeta)`
    )

    // For external packages, register ALL functions (they'll be invoked by consumers)
    // For main packages, only register functions that are invoked via internal RPCs
    const isExternalPackage = !!config.externalPackageName
    const hasRPCs = rpc.exposedFiles.size > 0 || rpc.internalFiles.size > 0
    const hasFunctions = functions.files.size > 0

    const shouldGenerateFunctionsFile = isExternalPackage
      ? hasFunctions
      : hasRPCs

    if (shouldGenerateFunctionsFile) {
      // For external packages, use all function files; for main packages, use internal RPC files
      const filesToRegister = isExternalPackage
        ? functions.files
        : rpc.internalFiles

      await writeFileInDir(
        logger,
        functionsFile,
        serializeFunctionImports(
          functionsFile,
          filesToRegister,
          functions.meta,
          packageMappings,
          config.externalPackageName
        )
      )
    }

    return shouldGenerateFunctionsFile
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku functions',
      commandEnd: 'Serialized Pikku functions',
    }),
  ],
})
