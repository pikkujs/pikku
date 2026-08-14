import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeWorkflowTypes } from './serialize-workflow-types.js'
import { serializePersonas } from './serialize-personas.js'
import { resolvePersonas } from '../../../utils/resolve-personas.js'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'
import { serializeWorkflowMap } from './serialize-workflow-map.js'
import { serializeScenarioStepMap } from './serialize-scenario-step-map.js'
import { serializeWorkflowBootstrapMap } from './serialize-workflow-bootstrap-map.js'
import { serializeWorkflowMeta } from './serialize-workflow-meta.js'
import { partitionScenarioWorkflows } from '../scenarios/scenario-partition.js'
import { serializeScenarioRegistration } from '../scenarios/serialize-scenario-registration.js'
import { buildFeaturesMeta } from '../scenarios/serialize-feature-meta.js'
import { serializeScenarioWorkflowMeta } from '../scenarios/serialize-scenario-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'
import { join } from 'path'
import { rm } from 'fs/promises'

type WorkflowCommandInput = {
  bootstrap?: boolean
}

export const pikkuWorkflow = pikkuSessionlessFunc<
  WorkflowCommandInput,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }, input) => {
    const bootstrap = input?.bootstrap === true
    const visitState = bootstrap
      ? await getInspectorState(false, true, true)
      : await getInspectorState()
    const {
      workflowsWiringFile,
      workflowsWiringMetaFile,
      workflowMetaDir,
      workflowMapDeclarationFile,
      workflowTypesFile,
      functionTypesFile,
      packageMappings,
      schema,
    } = config
    const { workflows, functions: functionState } = visitState
    const { typesMap } = functionState

    const allWorkflowNames = [
      ...new Set([
        ...Object.keys(workflows.graphMeta),
        ...Object.keys(workflows.meta),
      ]),
    ]
    const hasRelevantWorkflows = allWorkflowNames.length > 0
    const hasWorkflows = hasRelevantWorkflows

    // Scenarios and features are held back from every app-facing artifact: they
    // are only ever run by `pikku scenario run`, and registering them in the app
    // bootstrap drags each scenario's steps — and whatever those import — into a
    // deployed server.
    const { appNames, scenarioNames, appFiles, scenarioFiles } =
      partitionScenarioWorkflows(
        allWorkflowNames,
        workflows.files,
        workflows.graphMeta
      )

    if (hasWorkflows) {
      const singletonServices =
        visitState.serviceAggregation.allSingletonServices.length > 0
          ? visitState.serviceAggregation.allSingletonServices
          : visitState.typesLookup?.get('SingletonServices')?.[0]
            ? visitState.typesLookup
                .get('SingletonServices')![0]
                .getProperties()
                .map((symbol) => symbol.getName())
            : []
      const hasWorkflowState = singletonServices.includes('workflowService')
      if (!hasWorkflowState) {
        logger.critical(
          ErrorCode.WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED,
          'Workflows detected but workflowService service not configured. Please add workflowService to your singleton services'
        )
        throw new Error(
          'WorkflowState service not configured but workflows are defined'
        )
      }
    }

    if (hasWorkflows && workflowMetaDir) {
      const scenarioNameSet = new Set(scenarioNames)
      for (const [name, graphMeta] of Object.entries(workflows.graphMeta)) {
        const metaDir = scenarioNameSet.has(name)
          ? config.scenarioMetaDir
          : workflowMetaDir
        const minimalMeta = stripVerboseFields(graphMeta)
        const minimalPath = join(metaDir, `${name}.gen.json`)
        await writeFileInDir(
          logger,
          minimalPath,
          JSON.stringify(minimalMeta, null, 2),
          { ignoreModifyComment: true }
        )

        if (hasVerboseFields(graphMeta)) {
          const verbosePath = join(metaDir, `${name}-verbose.gen.json`)
          await writeFileInDir(
            logger,
            verbosePath,
            JSON.stringify(graphMeta, null, 2),
            { ignoreModifyComment: true }
          )
        }
      }
    }

    // A project generated before scenarios moved out has their meta sitting in
    // workflow/meta, and getWorkflowMeta() reads both directories — leaving it
    // there would serve a stale copy of every scenario forever.
    if (workflowMetaDir) {
      await Promise.all(
        scenarioNames.flatMap((name) =>
          [`${name}.gen.json`, `${name}-verbose.gen.json`].map((file) =>
            rm(join(workflowMetaDir, file), { force: true })
          )
        )
      )
    }

    if (workflowsWiringMetaFile && workflowMetaDir) {
      await writeFileInDir(
        logger,
        workflowsWiringMetaFile,
        serializeWorkflowMeta(
          workflowsWiringMetaFile,
          workflowMetaDir,
          appNames,
          packageMappings,
          schema?.supportsImportAttributes ?? false,
          config.addonName
        )
      )
    }

    await writeFileInDir(
      logger,
      config.scenarioWiringsMetaFile,
      serializeScenarioWorkflowMeta(
        config.scenarioWiringsMetaFile,
        config.scenarioMetaDir,
        getFileImportRelativePath(
          config.scenarioWiringsMetaFile,
          workflowsWiringMetaFile,
          packageMappings
        ),
        scenarioNames,
        packageMappings,
        schema?.supportsImportAttributes ?? false,
        config.addonName
      )
    )

    await writeFileInDir(
      logger,
      config.scenarioWiringsFile,
      serializeScenarioRegistration(
        config.scenarioWiringsFile,
        getFileImportRelativePath(
          config.scenarioWiringsFile,
          config.scenarioWiringsMetaFile,
          packageMappings
        ),
        scenarioFiles,
        workflows.featureFiles,
        packageMappings,
        config.addonName
      )
    )

    const metaImportPath = getFileImportRelativePath(
      workflowsWiringFile,
      workflowsWiringMetaFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowsWiringFile,
      serializeWorkflowRegistration(
        workflowsWiringFile,
        metaImportPath,
        appNames,
        appFiles,
        workflows.graphFiles,
        packageMappings,
        config.addonName
      )
    )

    const functionTypesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      functionTypesFile,
      packageMappings
    )
    const rpcMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.rpcInternalMapDeclarationFile,
      packageMappings
    )
    const workflowMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      workflowMapDeclarationFile,
      packageMappings
    )
    const agentMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.agentMapDeclarationFile,
      packageMappings
    )
    const scopesImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.scopesFile,
      packageMappings
    )
    const scenarioStepMapImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.scenarioStepMapDeclarationFile,
      packageMappings
    )
    const personasImportPath = getFileImportRelativePath(
      workflowTypesFile,
      config.personasWiringFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      workflowTypesFile,
      serializeWorkflowTypes(
        functionTypesImportPath,
        rpcMapImportPath,
        workflowMapImportPath,
        agentMapImportPath,
        scopesImportPath,
        scenarioStepMapImportPath,
        personasImportPath
      )
    )

    // Rides the workflow command rather than getting its own codegen node, so
    // it can't drift out of the two hand-maintained ordering lists.
    await writeFileInDir(
      logger,
      config.scenarioStepMapDeclarationFile,
      serializeScenarioStepMap(
        logger,
        config.scenarioStepMapDeclarationFile,
        packageMappings,
        typesMap,
        functionState.meta
      )
    )

    // Written even when nobody declared a persona, so `TypedPersonas` is always
    // a resolvable import for the generated function types.
    const personas = resolvePersonas(
      visitState.personas.definitions,
      config.scenarios?.emailDomain
    )
    {
      const agentMapImportPath = getFileImportRelativePath(
        config.personasWiringFile,
        config.agentMapDeclarationFile,
        packageMappings
      )
      const exposedRpcMapImportPath = getFileImportRelativePath(
        config.personasWiringFile,
        config.rpcMapDeclarationFile,
        packageMappings
      )
      await writeFileInDir(
        logger,
        config.personasWiringFile,
        serializePersonas(personas, agentMapImportPath, exposedRpcMapImportPath)
      )
      // Fixed path getPersonasMeta() reads; kept out of workflow/meta, which
      // getWorkflowMeta() globs as workflows.
      await writeFileInDir(
        logger,
        join(config.outDir, 'workflow', 'personas.gen.json'),
        JSON.stringify(personas, null, 2)
      )
    }

    // Fixed path getFeaturesMeta() reads. Written even when empty so the
    // console can tell "no features declared" from "meta not generated yet".
    await writeFileInDir(
      logger,
      join(config.outDir, 'scenarios', 'features.gen.json'),
      JSON.stringify(buildFeaturesMeta(workflows.featureFiles), null, 2)
    )

    await writeFileInDir(
      logger,
      workflowMapDeclarationFile,
      bootstrap
        ? serializeWorkflowBootstrapMap(workflows.meta, workflows.graphMeta)
        : serializeWorkflowMap(
            logger,
            workflowMapDeclarationFile,
            packageMappings,
            typesMap,
            functionState.meta,
            workflows.meta,
            workflows.graphMeta,
            visitState.rpc?.wireAddonDeclarations
          )
    )

    return hasWorkflows
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Workflows',
      commandEnd: 'Generated Workflows',
    }),
  ],
})
