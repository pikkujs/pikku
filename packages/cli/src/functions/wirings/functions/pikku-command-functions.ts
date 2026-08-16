import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFunctionImports } from './serialize-function-imports.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
  reattachFunctionServices,
} from '../../../utils/strip-verbose-meta.js'
import {
  partitionScenarioFunctions,
  partitionScenarioFunctionsMeta,
} from '../scenarios/scenario-partition.js'
import { serializeScenarioFunctionMeta } from '../scenarios/serialize-scenario-meta.js'

export const pikkuFunctions = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc } = await getInspectorState()
    const {
      functionsMetaFile,
      functionsMetaJsonFile,
      functionsFile,
      scenarioStepsFile,
      scenarioStepsMetaFile,
      scenarioStepsMetaJsonFile,
      packageMappings,
      schema,
    } = config

    const { app: appFunctionsMeta, scenario: scenarioFunctionsMeta } =
      partitionScenarioFunctionsMeta(functions.meta)

    let minimalMeta = stripVerboseFields(appFunctionsMeta)
    if (config.addonName) {
      minimalMeta = reattachFunctionServices(minimalMeta, appFunctionsMeta)
    }
    await writeFileInDir(
      logger,
      functionsMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(appFunctionsMeta)) {
      const verbosePath = functionsMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(appFunctionsMeta, null, 2)
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

    const packageName = config.addonName ? `'${config.addonName}'` : 'null'

    await writeFileInDir(
      logger,
      functionsMetaFile,
      `import { pikkuState } from '@pikku/core/ecosystem'\nimport type { FunctionsMeta } from '@pikku/core/ecosystem/services'\n${importStatement}\npikkuState(${packageName}, 'function', 'meta', metaData as FunctionsMeta)`
    )

    // For addon packages, register ALL functions (they'll be invoked by consumers)
    // For main packages, only register functions that are invoked via internal RPCs
    const isAddon = !!config.addonName
    const hasRPCs = rpc.exposedFiles.size > 0 || rpc.internalFiles.size > 0
    const hasFunctions = functions.files.size > 0

    const shouldGenerateFunctionsFile = isAddon ? hasFunctions : hasRPCs

    // For addon packages, use all function files; for main packages, use internal RPC files
    const filesToRegister = isAddon ? functions.files : rpc.internalFiles
    const { app: appFiles, scenario: scenarioFiles } =
      partitionScenarioFunctions(filesToRegister, functions.meta)

    if (shouldGenerateFunctionsFile) {
      await writeFileInDir(
        logger,
        functionsFile,
        serializeFunctionImports(
          functionsFile,
          appFiles,
          appFunctionsMeta,
          packageMappings,
          config.addonName
        )
      )
    }

    // Always written, even when empty: a project that deletes its last scenario
    // must stop registering the one it had, and the scenario bootstrap imports
    // these unconditionally.
    await writeFileInDir(
      logger,
      scenarioStepsMetaJsonFile,
      JSON.stringify(stripVerboseFields(scenarioFunctionsMeta), null, 2)
    )
    // The bootstrap imports the stripped copy; the verbose one is read off disk
    // by whatever documents a scenario — the console needs `sourceFile` and
    // `exportedName` to show the code a step runs.
    if (hasVerboseFields(scenarioFunctionsMeta)) {
      await writeFileInDir(
        logger,
        scenarioStepsMetaJsonFile.replace(/\.gen\.json$/, '-verbose.gen.json'),
        JSON.stringify(scenarioFunctionsMeta, null, 2)
      )
    }
    await writeFileInDir(
      logger,
      scenarioStepsMetaFile,
      serializeScenarioFunctionMeta(
        getFileImportRelativePath(
          scenarioStepsMetaFile,
          scenarioStepsMetaJsonFile,
          packageMappings
        ),
        getFileImportRelativePath(
          scenarioStepsMetaFile,
          functionsMetaFile,
          packageMappings
        ),
        supportsImportAttributes,
        config.addonName
      )
    )
    await writeFileInDir(
      logger,
      scenarioStepsFile,
      scenarioFiles.size === 0
        ? 'export {}'
        : serializeFunctionImports(
            scenarioStepsFile,
            scenarioFiles,
            scenarioFunctionsMeta,
            packageMappings,
            config.addonName
          )
    )

    return shouldGenerateFunctionsFile
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku functions',
      commandEnd: 'Serialized Pikku functions',
    }),
  ],
})
