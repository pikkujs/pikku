import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeFunctionImports } from './serialize-function-imports.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  reattachFunctionServices,
  reattachAgentToolDescriptions,
} from '../../../utils/strip-verbose-meta.js'
import {
  writeMetaSidecar,
  writeWiringMeta,
} from '../../../utils/write-wiring-meta.js'
import {
  partitionScenarioFunctions,
  partitionScenarioFunctionsMeta,
} from '../scenarios/scenario-partition.js'
import { serializeScenarioFunctionMeta } from '../scenarios/serialize-scenario-meta.js'

export const pikkuFunctions = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const { functions, rpc, agents } = await getInspectorState()
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
    minimalMeta = reattachAgentToolDescriptions(
      minimalMeta,
      appFunctionsMeta,
      new Set(
        Object.values(agents.agentsMeta).flatMap((agent) => agent.tools ?? [])
      )
    )

    const packageName = config.addonName ? `'${config.addonName}'` : 'null'
    const supportsImportAttributes = schema?.supportsImportAttributes ?? false

    await writeWiringMeta({
      logger,
      meta: appFunctionsMeta,
      minimalMeta,
      metaJsonFile: functionsMetaJsonFile,
      metaFile: functionsMetaFile,
      packageMappings,
      supportsImportAttributes,
      serializeMetaTS: ({ importStatement }) =>
        `import { pikkuState } from '@pikku/core/state'\nimport type { FunctionsMeta } from '@pikku/core/services'\n${importStatement}\npikkuState(${packageName}, 'function', 'meta', metaData as FunctionsMeta)`,
    })

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
    //
    // The bootstrap imports the stripped copy; the verbose one is read off disk
    // by whatever documents a scenario — the console needs `sourceFile` and
    // `exportedName` to show the code a step runs.
    await writeMetaSidecar({
      logger,
      meta: scenarioFunctionsMeta,
      metaJsonFile: scenarioStepsMetaJsonFile,
    })
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
