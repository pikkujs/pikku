import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFunctionImports } from './serialize-function-imports.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuFunctions = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      functionsMetaFile,
      functionsMetaJsonFile,
      functionsFile,
      packageMappings,
      schema,
    } = config

    // Write minimal JSON (runtime-only fields)
    const minimalMeta = stripVerboseFields(functions.meta)
    await writeFileInDir(
      logger,
      functionsMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(functions.meta)) {
      const verbosePath = functionsMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(functions.meta, null, 2)
      )
    }

    const jsonImportPath = getFileImportRelativePath(
      functionsMetaFile,
      functionsMetaJsonFile,
      packageMappings
    )

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const importStatement = supportsImportAttributes
      ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
      : `import metaData from '${jsonImportPath}'`

    const packageName = config.externalPackageName
      ? `'${config.externalPackageName}'`
      : 'null'

    await writeFileInDir(
      logger,
      functionsMetaFile,
      `import { pikkuState } from '@pikku/core/internal'\nimport type { FunctionsMeta } from '@pikku/core'\n${importStatement}\npikkuState(${packageName}, 'function', 'meta', metaData as FunctionsMeta)`
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
